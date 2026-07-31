package finance

import (
	"testing"
)

func TestParseInboxItemDocType(t *testing.T) {
	tests := []struct {
		input string
		want  InboxItemDocType
	}{
		{"INVOICE", InboxItemDocInvoice},
		{"invoice", InboxItemDocInvoice},
		{"RECEIPT", InboxItemDocReceipt},
		{"bank_notification", InboxItemDocBankNotification},
		{"SYSTEM_VERIFICATION", InboxItemDocSystemVerification},
		{"unknown_type", InboxItemDocUnknown},
		{"", InboxItemDocUnknown},
	}

	for _, tt := range tests {
		got := ParseInboxItemDocType(tt.input)
		if got != tt.want {
			t.Errorf("ParseInboxItemDocType(%q) = %v, want %v", tt.input, got, tt.want)
		}
	}
}
