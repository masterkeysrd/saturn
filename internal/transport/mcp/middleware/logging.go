package middleware

import (
	"context"
	"log/slog"
	"time"

	"github.com/masterkeysrd/saturn/internal/foundation/auth"
	sdkmcp "github.com/modelcontextprotocol/go-sdk/mcp"
)

// LoggingMiddleware records structured slog entries for MCP requests received by the server.
func LoggingMiddleware(logger *slog.Logger) sdkmcp.Middleware {
	if logger == nil {
		logger = slog.Default()
	}

	return func(next sdkmcp.MethodHandler) sdkmcp.MethodHandler {
		return func(ctx context.Context, method string, req sdkmcp.Request) (sdkmcp.Result, error) {
			start := time.Now()
			res, err := next(ctx, method, req)

			spaceID, _ := auth.SpaceIDFromContext(ctx)
			role, _ := auth.SpaceRoleFromContext(ctx)
			principal, _ := auth.PrincipalFromContext(ctx)

			attrs := []slog.Attr{
				slog.String("mcp_method", method),
				slog.String("space_id", spaceID),
				slog.String("space_role", role),
				slog.String("user_id", principal.Subject),
				slog.Int64("duration_ms", time.Since(start).Milliseconds()),
			}

			if callReq, ok := req.(*sdkmcp.CallToolRequest); ok && callReq != nil && callReq.Params != nil {
				attrs = append(attrs, slog.String("tool", callReq.Params.Name))
			} else if resReq, ok := req.(*sdkmcp.ReadResourceRequest); ok && resReq != nil && resReq.Params != nil {
				attrs = append(attrs, slog.String("resource_uri", resReq.Params.URI))
			}

			if err != nil {
				attrs = append(attrs, slog.String("error", err.Error()))
				logger.LogAttrs(ctx, slog.LevelWarn, "mcp request failed", attrs...)
			} else {
				logger.LogAttrs(ctx, slog.LevelInfo, "mcp request completed", attrs...)
			}

			return res, err
		}
	}
}
