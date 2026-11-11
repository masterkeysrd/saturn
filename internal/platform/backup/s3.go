package backup

import (
	"bytes"
	"context"
	"fmt"
	"io"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/aws/aws-sdk-go-v2/service/s3/types"
	"github.com/masterkeysrd/saturn/internal/platform/errors"
	"github.com/masterkeysrd/saturn/internal/platform/log"
)

const (
	// s3MultipartChunkSize is 5 MiB, the minimum part size required by S3-compatible
	// object stores for non-final multipart upload parts.
	s3MultipartChunkSize = 5 * 1024 * 1024
	s3AbortTimeout       = 30 * time.Second
)

type s3Client interface {
	PutObject(ctx context.Context, params *s3.PutObjectInput, optFns ...func(*s3.Options)) (*s3.PutObjectOutput, error)
	GetObject(ctx context.Context, params *s3.GetObjectInput, optFns ...func(*s3.Options)) (*s3.GetObjectOutput, error)
	DeleteObject(ctx context.Context, params *s3.DeleteObjectInput, optFns ...func(*s3.Options)) (*s3.DeleteObjectOutput, error)
	CreateMultipartUpload(ctx context.Context, params *s3.CreateMultipartUploadInput, optFns ...func(*s3.Options)) (*s3.CreateMultipartUploadOutput, error)
	UploadPart(ctx context.Context, params *s3.UploadPartInput, optFns ...func(*s3.Options)) (*s3.UploadPartOutput, error)
	CompleteMultipartUpload(ctx context.Context, params *s3.CompleteMultipartUploadInput, optFns ...func(*s3.Options)) (*s3.CompleteMultipartUploadOutput, error)
	AbortMultipartUpload(ctx context.Context, params *s3.AbortMultipartUploadInput, optFns ...func(*s3.Options)) (*s3.AbortMultipartUploadOutput, error)
}

// S3Storage implements Storage using standard S3 object storage APIs.
type S3Storage struct {
	client    s3Client
	bucket    string
	chunkSize int
}

// NewS3Storage instantiates a new S3-compatible storage driver.
func NewS3Storage(ctx context.Context, bucket, region, endpoint string) (*S3Storage, error) {
	const op errors.Op = "platform/backup.NewS3Storage"

	// Initialize AWS config. Can automatically resolve IAM roles or credentials.
	cfg, err := config.LoadDefaultConfig(ctx, config.WithRegion(region))
	if err != nil {
		return nil, errors.E(op, err)
	}

	// Create S3 client options. If endpoint is specified (e.g. for R2 or MinIO), override the base resolver.
	var clientOpts []func(*s3.Options)
	if endpoint != "" {
		clientOpts = append(clientOpts, func(o *s3.Options) {
			o.BaseEndpoint = aws.String(endpoint)
			// Force path-style addressing for local MinIO/R2 targets if needed
			o.UsePathStyle = true
		})
	}

	client := s3.NewFromConfig(cfg, clientOpts...)

	return &S3Storage{
		client:    client,
		bucket:    bucket,
		chunkSize: s3MultipartChunkSize,
	}, nil
}

// Upload streams data of arbitrary size (including unseekable io.Pipe streams)
// to S3 with bounded memory. Payloads smaller than the chunk size use a single
// PutObject call; larger streams use S3 multipart upload with a reusable buffer.
func (s *S3Storage) Upload(ctx context.Context, key string, reader io.Reader) error {
	const op errors.Op = "platform/backup.S3Storage.Upload"

	chunkSize := s.chunkSize
	if chunkSize <= 0 {
		chunkSize = s3MultipartChunkSize
	}

	buf := make([]byte, chunkSize)
	n, eof, err := readFullChunk(reader, buf)
	if err != nil {
		return errors.E(op, err)
	}

	// Fast path: entire stream fit in the first buffer (< chunkSize, or empty).
	// bytes.NewReader provides an io.ReadSeeker with exact ContentLength so S3
	// SigV4 signing succeeds without seeking the upstream reader.
	if eof {
		_, err = s.client.PutObject(ctx, &s3.PutObjectInput{
			Bucket:        aws.String(s.bucket),
			Key:           aws.String(key),
			Body:          bytes.NewReader(buf[:n]),
			ContentLength: new(int64(n)),
		})
		if err != nil {
			return errors.E(op, err)
		}
		return nil
	}

	// Stream reached chunkSize without EOF; switch to S3 multipart upload.
	createOut, err := s.client.CreateMultipartUpload(ctx, &s3.CreateMultipartUploadInput{
		Bucket: aws.String(s.bucket),
		Key:    aws.String(key),
	})
	if err != nil {
		return errors.E(op, err)
	}

	uploadID := createOut.UploadId
	abortUpload := func() {
		abortCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), s3AbortTimeout)
		defer cancel()

		if _, abortErr := s.client.AbortMultipartUpload(abortCtx, &s3.AbortMultipartUploadInput{
			Bucket:   aws.String(s.bucket),
			Key:      aws.String(key),
			UploadId: uploadID,
		}); abortErr != nil {
			log.Warn(abortCtx, "failed to abort s3 multipart upload",
				log.String("bucket", s.bucket),
				log.String("key", key),
				log.Err(abortErr),
			)
		}
	}

	var completedParts []types.CompletedPart
	partNum := int32(1)

	partOut, err := s.client.UploadPart(ctx, &s3.UploadPartInput{
		Bucket:        aws.String(s.bucket),
		Key:           aws.String(key),
		UploadId:      uploadID,
		PartNumber:    new(partNum),
		Body:          bytes.NewReader(buf[:n]),
		ContentLength: new(int64(n)),
	})
	if err != nil {
		abortUpload()
		return errors.E(op, fmt.Errorf("upload part %d: %w", partNum, err))
	}
	completedParts = append(completedParts, types.CompletedPart{
		ETag:       partOut.ETag,
		PartNumber: new(partNum),
	})

	for {
		n, eof, err = readFullChunk(reader, buf)
		if err != nil {
			abortUpload()
			return errors.E(op, err)
		}
		if n > 0 {
			partNum++
			partOut, err = s.client.UploadPart(ctx, &s3.UploadPartInput{
				Bucket:        aws.String(s.bucket),
				Key:           aws.String(key),
				UploadId:      uploadID,
				PartNumber:    new(partNum),
				Body:          bytes.NewReader(buf[:n]),
				ContentLength: new(int64(n)),
			})
			if err != nil {
				abortUpload()
				return errors.E(op, fmt.Errorf("upload part %d: %w", partNum, err))
			}
			completedParts = append(completedParts, types.CompletedPart{
				ETag:       partOut.ETag,
				PartNumber: new(partNum),
			})
		}
		if eof {
			break
		}
	}

	_, err = s.client.CompleteMultipartUpload(ctx, &s3.CompleteMultipartUploadInput{
		Bucket:   aws.String(s.bucket),
		Key:      aws.String(key),
		UploadId: uploadID,
		MultipartUpload: &types.CompletedMultipartUpload{
			Parts: completedParts,
		},
	})
	if err != nil {
		abortUpload()
		return errors.E(op, err)
	}

	return nil
}

// readFullChunk reads from r until buf is completely filled or io.EOF is reached.
func readFullChunk(r io.Reader, buf []byte) (int, bool, error) {
	total := 0
	for total < len(buf) {
		n, err := r.Read(buf[total:])
		total += n
		if err != nil {
			if err == io.EOF {
				return total, true, nil
			}
			return total, false, err
		}
	}
	return total, false, nil
}

// Download fetches an object from S3.
func (s *S3Storage) Download(ctx context.Context, key string, writer io.Writer) error {
	const op errors.Op = "platform/backup.S3Storage.Download"

	resp, err := s.client.GetObject(ctx, &s3.GetObjectInput{
		Bucket: aws.String(s.bucket),
		Key:    aws.String(key),
	})
	if err != nil {
		return errors.E(op, err)
	}
	defer func() { _ = resp.Body.Close() }()

	if _, err = io.Copy(writer, resp.Body); err != nil {
		return errors.E(op, err)
	}
	return nil
}

// Delete removes an object from S3.
func (s *S3Storage) Delete(ctx context.Context, key string) error {
	const op errors.Op = "platform/backup.S3Storage.Delete"

	_, err := s.client.DeleteObject(ctx, &s3.DeleteObjectInput{
		Bucket: aws.String(s.bucket),
		Key:    aws.String(key),
	})
	if err != nil {
		return errors.E(op, err)
	}
	return nil
}
