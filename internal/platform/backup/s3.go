package backup

import (
	"context"
	"io"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/masterkeysrd/saturn/internal/platform/errors"
)

// S3Storage implements Storage using standard S3 object storage APIs.
type S3Storage struct {
	client *s3.Client
	bucket string
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
		client: client,
		bucket: bucket,
	}, nil
}

// Upload writes a stream to S3 bucket.
func (s *S3Storage) Upload(ctx context.Context, key string, reader io.Reader) error {
	const op errors.Op = "platform/backup.S3Storage.Upload"

	_, err := s.client.PutObject(ctx, &s3.PutObjectInput{
		Bucket: aws.String(s.bucket),
		Key:    aws.String(key),
		Body:   reader,
	})
	if err != nil {
		return errors.E(op, err)
	}
	return nil
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
