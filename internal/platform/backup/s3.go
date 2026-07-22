package backup

import (
	"context"
	"fmt"
	"io"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/feature/s3/manager"
	"github.com/aws/aws-sdk-go-v2/service/s3"
)

// S3Storage implements Storage using standard S3 object storage APIs.
type S3Storage struct {
	client *s3.Client
	bucket string
}

// NewS3Storage instantiates a new S3-compatible storage driver.
func NewS3Storage(ctx context.Context, bucket, region, endpoint string) (*S3Storage, error) {
	// Initialize AWS config. Can automatically resolve IAM roles or credentials.
	cfg, err := config.LoadDefaultConfig(ctx, config.WithRegion(region))
	if err != nil {
		return nil, fmt.Errorf("load aws config: %w", err)
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
		client: client,
		bucket: bucket,
	}, nil
}

// Upload writes a stream to S3 bucket.
func (s *S3Storage) Upload(ctx context.Context, key string, reader io.Reader) error {
	uploader := manager.NewUploader(s.client)
	_, err := uploader.Upload(ctx, &s3.PutObjectInput{
		Bucket: aws.String(s.bucket),
		Key:    aws.String(key),
		Body:   reader,
	})
	return err
}

// Download fetches an object from S3.
func (s *S3Storage) Download(ctx context.Context, key string, writer io.Writer) error {
	downloader := manager.NewDownloader(s.client)
	// We use bufferWriter to support downloading to non-seekable streams
	buffer := manager.NewWriteAtBuffer([]byte{})
	_, err := downloader.Download(ctx, buffer, &s3.GetObjectInput{
		Bucket: aws.String(s.bucket),
		Key:    aws.String(key),
	})
	if err != nil {
		return err
	}

	_, err = writer.Write(buffer.Bytes())
	return err
}

// Delete removes an object from S3.
func (s *S3Storage) Delete(ctx context.Context, key string) error {
	_, err := s.client.DeleteObject(ctx, &s3.DeleteObjectInput{
		Bucket: aws.String(s.bucket),
		Key:    aws.String(key),
	})
	return err
}
