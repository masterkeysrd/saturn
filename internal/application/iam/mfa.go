package iam

import (
	"context"

	"github.com/masterkeysrd/saturn/internal/domain/identity"
	"github.com/masterkeysrd/saturn/internal/platform/qrcode"
	"github.com/masterkeysrd/saturn/internal/platform/totp"
)

// ListMFAFactorsRequest encapsulates parameters to list MFA factors.
type ListMFAFactorsRequest struct {
	UserID identity.UserID
}

// ListMFAFactorsResponse holds the list of registered MFA factors and recovery code status.
type ListMFAFactorsResponse struct {
	identity.MFAFactorsSummary
}

// DeleteMFAFactorRequest encapsulates parameters to delete an MFA factor.
type DeleteMFAFactorRequest struct {
	identity.DeleteMFAFactorRequest
}

// SetPrimaryMFAFactorRequest encapsulates parameters to set a primary MFA factor.
type SetPrimaryMFAFactorRequest struct {
	identity.SetPrimaryMFAFactorRequest
}

// SetupTOTPRequest encapsulates the parameters required to initialize TOTP enrollment.
type SetupTOTPRequest struct {
	identity.SetupTOTPRequest
}

// SetupTOTPResponse holds the staged factor ID, secret, and otpauth URI/QR code.
type SetupTOTPResponse struct {
	FactorID   string
	Secret     string
	OtpauthURI string
	QRCodeSVG  string
}

// ConfirmTOTPRequest encapsulates the confirmation code for a staged TOTP factor.
type ConfirmTOTPRequest struct {
	UserID   identity.UserID
	FactorID string
	Code     string
}

// ConfirmTOTPResponse holds the confirmation outcome and any initial backup recovery codes.
type ConfirmTOTPResponse struct {
	BackupCodes []string
}

// RegenerateBackupCodesRequest holds the step-up verification code for regenerating recovery codes.
type RegenerateBackupCodesRequest struct {
	identity.RegenerateBackupCodesRequest
}

// RegenerateBackupCodesResponse holds the newly generated set of backup recovery codes.
type RegenerateBackupCodesResponse struct {
	BackupCodes []string
}

// ListMFAFactors retrieves all active MFA factors for a user.
func (c *coordinator) ListMFAFactors(ctx context.Context, req *ListMFAFactorsRequest) (*ListMFAFactorsResponse, error) {
	summary, err := c.identityService.ListMFAFactors(ctx, req.UserID)
	if err != nil {
		return nil, err
	}
	return &ListMFAFactorsResponse{
		MFAFactorsSummary: *summary,
	}, nil
}

// DeleteMFAFactor removes a registered MFA factor for a user.
func (c *coordinator) DeleteMFAFactor(ctx context.Context, req *DeleteMFAFactorRequest) error {
	return c.identityService.DeleteMFAFactor(ctx, req.DeleteMFAFactorRequest)
}

// SetPrimaryMFAFactor marks a factor as the user's default/primary option.
func (c *coordinator) SetPrimaryMFAFactor(ctx context.Context, req *SetPrimaryMFAFactorRequest) error {
	return c.identityService.SetPrimaryMFAFactor(ctx, req.SetPrimaryMFAFactorRequest)
}

// SetupTOTP initiates TOTP enrollment.
func (c *coordinator) SetupTOTP(ctx context.Context, req *SetupTOTPRequest) (*SetupTOTPResponse, error) {
	res, err := c.identityService.SetupTOTP(ctx, req.SetupTOTPRequest)
	if err != nil {
		return nil, err
	}

	otpauthURI := totp.BuildURI(res.Secret, res.AccountName, "Saturn")
	qrSVG, err := qrcode.GenerateSVG(otpauthURI)
	if err != nil {
		return nil, err
	}

	return &SetupTOTPResponse{
		FactorID:   string(res.FactorID),
		Secret:     res.Secret,
		OtpauthURI: otpauthURI,
		QRCodeSVG:  qrSVG,
	}, nil
}

// ConfirmTOTP confirms TOTP setup and returns any initial backup codes.
func (c *coordinator) ConfirmTOTP(ctx context.Context, req *ConfirmTOTPRequest) (*ConfirmTOTPResponse, error) {
	backupCodes, err := c.identityService.ConfirmTOTP(ctx, identity.ConfirmTOTPRequest{
		UserID:   req.UserID,
		FactorID: identity.MFAFactorID(req.FactorID),
		Code:     req.Code,
	})
	if err != nil {
		return nil, err
	}
	return &ConfirmTOTPResponse{
		BackupCodes: backupCodes,
	}, nil
}

// RegenerateBackupCodes generates a fresh set of recovery codes.
func (c *coordinator) RegenerateBackupCodes(ctx context.Context, req *RegenerateBackupCodesRequest) (*RegenerateBackupCodesResponse, error) {
	codes, err := c.identityService.RegenerateBackupCodes(ctx, req.RegenerateBackupCodesRequest)
	if err != nil {
		return nil, err
	}
	return &RegenerateBackupCodesResponse{
		BackupCodes: codes,
	}, nil
}
