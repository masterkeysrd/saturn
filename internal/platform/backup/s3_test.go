package backup

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"io"
	"sync"
	"testing"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/aws/aws-sdk-go-v2/service/s3/types"
)

type fakeS3Part struct {
	partNumber int32
	etag       string
	data       []byte
}

type fakeS3Client struct {
	mu sync.Mutex

	objects         map[string][]byte
	putObjectCalls  int
	createCalls     int
	uploadPartCalls int
	completeCalls   int
	abortCalls      int
	abortedUploads  []string

	putErr        error
	createErr     error
	uploadErrAt   int // 1-indexed UploadPart call number to fail
	uploadErr     error
	completeErr   error
	getErr        error
	deleteErr     error
	multipartData map[string][]fakeS3Part
}

func newFakeS3Client() *fakeS3Client {
	return &fakeS3Client{
		objects:       make(map[string][]byte),
		multipartData: make(map[string][]fakeS3Part),
	}
}

func (f *fakeS3Client) PutObject(_ context.Context, params *s3.PutObjectInput, _ ...func(*s3.Options)) (*s3.PutObjectOutput, error) {
	f.mu.Lock()
	defer f.mu.Unlock()

	f.putObjectCalls++
	if f.putErr != nil {
		return nil, f.putErr
	}

	// Simulate aws-sdk-go-v2 SigV4 behavior: Body must implement io.ReadSeeker
	// and provide an explicit ContentLength.
	if _, ok := params.Body.(io.ReadSeeker); !ok {
		return nil, errors.New("unseekable stream is not supported by PutObject without ReadSeeker")
	}
	if params.ContentLength == nil {
		return nil, errors.New("missing ContentLength on PutObject")
	}

	data, err := io.ReadAll(params.Body)
	if err != nil {
		return nil, err
	}
	if int64(len(data)) != *params.ContentLength {
		return nil, fmt.Errorf("ContentLength mismatch: got %d bytes, header %d", len(data), *params.ContentLength)
	}

	f.objects[aws.ToString(params.Key)] = data
	return &s3.PutObjectOutput{ETag: aws.String("etag-single")}, nil
}

func (f *fakeS3Client) CreateMultipartUpload(_ context.Context, params *s3.CreateMultipartUploadInput, _ ...func(*s3.Options)) (*s3.CreateMultipartUploadOutput, error) {
	f.mu.Lock()
	defer f.mu.Unlock()

	f.createCalls++
	if f.createErr != nil {
		return nil, f.createErr
	}

	uploadID := fmt.Sprintf("upload-%d-%s", f.createCalls, aws.ToString(params.Key))
	f.multipartData[uploadID] = nil
	return &s3.CreateMultipartUploadOutput{UploadId: aws.String(uploadID)}, nil
}

func (f *fakeS3Client) UploadPart(_ context.Context, params *s3.UploadPartInput, _ ...func(*s3.Options)) (*s3.UploadPartOutput, error) {
	f.mu.Lock()
	defer f.mu.Unlock()

	f.uploadPartCalls++
	if f.uploadErr != nil && f.uploadPartCalls == f.uploadErrAt {
		return nil, f.uploadErr
	}

	if _, ok := params.Body.(io.ReadSeeker); !ok {
		return nil, errors.New("unseekable stream is not supported by UploadPart")
	}
	if params.ContentLength == nil || *params.ContentLength <= 0 {
		return nil, errors.New("invalid ContentLength on UploadPart")
	}

	data, err := io.ReadAll(params.Body)
	if err != nil {
		return nil, err
	}
	if int64(len(data)) != *params.ContentLength {
		return nil, fmt.Errorf("part ContentLength mismatch: got %d, want %d", len(data), *params.ContentLength)
	}

	partNum := aws.ToInt32(params.PartNumber)
	etag := fmt.Sprintf("etag-part-%d", partNum)
	uploadID := aws.ToString(params.UploadId)
	f.multipartData[uploadID] = append(f.multipartData[uploadID], fakeS3Part{
		partNumber: partNum,
		etag:       etag,
		data:       data,
	})

	return &s3.UploadPartOutput{ETag: aws.String(etag)}, nil
}

func (f *fakeS3Client) CompleteMultipartUpload(_ context.Context, params *s3.CompleteMultipartUploadInput, _ ...func(*s3.Options)) (*s3.CompleteMultipartUploadOutput, error) {
	f.mu.Lock()
	defer f.mu.Unlock()

	f.completeCalls++
	if f.completeErr != nil {
		return nil, f.completeErr
	}

	uploadID := aws.ToString(params.UploadId)
	uploadedParts, ok := f.multipartData[uploadID]
	if !ok {
		return nil, fmt.Errorf("unknown uploadID %q", uploadID)
	}
	if params.MultipartUpload == nil || len(params.MultipartUpload.Parts) == 0 {
		return nil, errors.New("no completed parts supplied")
	}
	if len(params.MultipartUpload.Parts) != len(uploadedParts) {
		return nil, fmt.Errorf("completed parts count %d != uploaded count %d", len(params.MultipartUpload.Parts), len(uploadedParts))
	}

	var combined bytes.Buffer
	for i, cp := range params.MultipartUpload.Parts {
		up := uploadedParts[i]
		if aws.ToInt32(cp.PartNumber) != up.partNumber || aws.ToString(cp.ETag) != up.etag {
			return nil, fmt.Errorf("part %d mismatch: got (%d, %s), want (%d, %s)",
				i, aws.ToInt32(cp.PartNumber), aws.ToString(cp.ETag), up.partNumber, up.etag)
		}
		combined.Write(up.data)
	}

	f.objects[aws.ToString(params.Key)] = combined.Bytes()
	delete(f.multipartData, uploadID)
	return &s3.CompleteMultipartUploadOutput{}, nil
}

func (f *fakeS3Client) AbortMultipartUpload(_ context.Context, params *s3.AbortMultipartUploadInput, _ ...func(*s3.Options)) (*s3.AbortMultipartUploadOutput, error) {
	f.mu.Lock()
	defer f.mu.Unlock()

	f.abortCalls++
	uploadID := aws.ToString(params.UploadId)
	f.abortedUploads = append(f.abortedUploads, uploadID)
	delete(f.multipartData, uploadID)
	return &s3.AbortMultipartUploadOutput{}, nil
}

func (f *fakeS3Client) GetObject(_ context.Context, params *s3.GetObjectInput, _ ...func(*s3.Options)) (*s3.GetObjectOutput, error) {
	f.mu.Lock()
	defer f.mu.Unlock()

	if f.getErr != nil {
		return nil, f.getErr
	}
	data, ok := f.objects[aws.ToString(params.Key)]
	if !ok {
		return nil, &types.NoSuchKey{}
	}
	return &s3.GetObjectOutput{
		Body: io.NopCloser(bytes.NewReader(data)),
	}, nil
}

func (f *fakeS3Client) DeleteObject(_ context.Context, params *s3.DeleteObjectInput, _ ...func(*s3.Options)) (*s3.DeleteObjectOutput, error) {
	f.mu.Lock()
	defer f.mu.Unlock()

	if f.deleteErr != nil {
		return nil, f.deleteErr
	}
	delete(f.objects, aws.ToString(params.Key))
	return &s3.DeleteObjectOutput{}, nil
}

func makeDeterministicPayload(size int) []byte {
	buf := make([]byte, size)
	for i := range size {
		buf[i] = byte((i*31 + 7) % 251)
	}
	return buf
}

// streamViaPipe feeds payload into an unseekable io.Pipe in irregular chunks
// to mirror pg_dump writing over stdout, optionally failing with streamErr.
func streamViaPipe(payload []byte, writeStep int, streamErr error) io.Reader {
	pr, pw := io.Pipe()
	go func() {
		for offset := 0; offset < len(payload); offset += writeStep {
			end := min(offset+writeStep, len(payload))
			if _, err := pw.Write(payload[offset:end]); err != nil {
				return
			}
		}
		_ = pw.CloseWithError(streamErr)
	}()
	return pr
}

func TestS3Storage_Upload(t *testing.T) {
	const testChunkSize = 64 * 1024 // 64 KiB chunk size for fast unit test permutations

	tests := []struct {
		name            string
		payloadSize     int
		streamErr       error
		setupClient     func(c *fakeS3Client)
		wantErr         bool
		wantPutCalls    int
		wantCreateCalls int
		wantPartCalls   int
		wantComplete    int
		wantAbortCalls  int
	}{
		{
			name:         "empty 0-byte unseekable stream uses single PutObject",
			payloadSize:  0,
			wantPutCalls: 1,
		},
		{
			name:         "small unseekable stream (< chunkSize) uses single PutObject",
			payloadSize:  testChunkSize - 137,
			wantPutCalls: 1,
		},
		{
			name:            "exact chunkSize boundary uses 1-part multipart without empty trailing part",
			payloadSize:     testChunkSize,
			wantCreateCalls: 1,
			wantPartCalls:   1,
			wantComplete:    1,
		},
		{
			name:            "large multi-chunk unseekable stream uploads all parts sequentially",
			payloadSize:     testChunkSize*3 + 19_451,
			wantCreateCalls: 1,
			wantPartCalls:   4,
			wantComplete:    1,
		},
		{
			name:        "upstream reader error in first chunk makes zero S3 calls",
			payloadSize: testChunkSize / 2,
			streamErr:   errors.New("pg_dump connection lost"),
			wantErr:     true,
		},
		{
			name:            "upstream reader error mid-multipart aborts upload and cleans up parts",
			payloadSize:     testChunkSize*2 + 1024,
			streamErr:       errors.New("pg_dump killed mid-copy"),
			wantErr:         true,
			wantCreateCalls: 1,
			wantPartCalls:   2,
			wantAbortCalls:  1,
		},
		{
			name:        "PutObject failure returns error",
			payloadSize: 1024,
			setupClient: func(c *fakeS3Client) {
				c.putErr = errors.New("access denied")
			},
			wantErr:      true,
			wantPutCalls: 1,
		},
		{
			name:        "UploadPart failure aborts multipart upload",
			payloadSize: testChunkSize * 3,
			setupClient: func(c *fakeS3Client) {
				c.uploadErrAt = 2
				c.uploadErr = errors.New("part 2 network reset")
			},
			wantErr:         true,
			wantCreateCalls: 1,
			wantPartCalls:   2,
			wantAbortCalls:  1,
		},
		{
			name:        "CompleteMultipartUpload failure aborts multipart upload",
			payloadSize: testChunkSize*2 + 50,
			setupClient: func(c *fakeS3Client) {
				c.completeErr = errors.New("internal s3 error")
			},
			wantErr:         true,
			wantCreateCalls: 1,
			wantPartCalls:   3,
			wantComplete:    1,
			wantAbortCalls:  1,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			client := newFakeS3Client()
			if tt.setupClient != nil {
				tt.setupClient(client)
			}

			storage := &S3Storage{
				client:    client,
				bucket:    "saturn-backups",
				chunkSize: testChunkSize,
			}

			payload := makeDeterministicPayload(tt.payloadSize)
			reader := streamViaPipe(payload, 4093, tt.streamErr)

			err := storage.Upload(context.Background(), "saturn_backup_test.sql", reader)
			if (err != nil) != tt.wantErr {
				t.Fatalf("Upload() error = %v, wantErr %v", err, tt.wantErr)
			}

			if client.putObjectCalls != tt.wantPutCalls {
				t.Errorf("PutObject calls = %d, want %d", client.putObjectCalls, tt.wantPutCalls)
			}
			if client.createCalls != tt.wantCreateCalls {
				t.Errorf("CreateMultipartUpload calls = %d, want %d", client.createCalls, tt.wantCreateCalls)
			}
			if client.uploadPartCalls != tt.wantPartCalls {
				t.Errorf("UploadPart calls = %d, want %d", client.uploadPartCalls, tt.wantPartCalls)
			}
			if client.completeCalls != tt.wantComplete {
				t.Errorf("CompleteMultipartUpload calls = %d, want %d", client.completeCalls, tt.wantComplete)
			}
			if client.abortCalls != tt.wantAbortCalls {
				t.Errorf("AbortMultipartUpload calls = %d, want %d", client.abortCalls, tt.wantAbortCalls)
			}

			if !tt.wantErr {
				got, ok := client.objects["saturn_backup_test.sql"]
				if !ok {
					t.Fatal("expected uploaded object to exist in bucket")
				}
				if !bytes.Equal(got, payload) {
					t.Fatalf("uploaded payload mismatch: got %d bytes, want %d bytes", len(got), len(payload))
				}
			} else if _, ok := client.objects["saturn_backup_test.sql"]; ok {
				t.Fatal("expected no object persisted on failed upload")
			}
		})
	}
}

func TestS3Storage_DownloadAndDelete(t *testing.T) {
	ctx := context.Background()
	client := newFakeS3Client()
	storage := &S3Storage{
		client: client,
		bucket: "saturn-backups",
	}

	payload := []byte("-- PostgreSQL database dump\nSELECT 1;\n")
	if err := storage.Upload(ctx, "dump.sql", streamViaPipe(payload, 7, nil)); err != nil {
		t.Fatalf("Upload() unexpected error: %v", err)
	}

	var out bytes.Buffer
	if err := storage.Download(ctx, "dump.sql", &out); err != nil {
		t.Fatalf("Download() unexpected error: %v", err)
	}
	if !bytes.Equal(out.Bytes(), payload) {
		t.Fatalf("Download() = %q, want %q", out.Bytes(), payload)
	}

	if err := storage.Delete(ctx, "dump.sql"); err != nil {
		t.Fatalf("Delete() unexpected error: %v", err)
	}

	if err := storage.Download(ctx, "dump.sql", &out); err == nil {
		t.Fatal("expected Download() after Delete() to fail, got nil")
	}
}
