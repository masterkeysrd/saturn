import { money, type CurrencyCode } from "@/lib/money";
import Box from "@mui/material/Box";
import IconButton from "@mui/material/IconButton";
import Stack from "@mui/material/Stack";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import CheckIcon from "@mui/icons-material/Check";
import EditIcon from "@mui/icons-material/Edit";
import RestartAltIcon from "@mui/icons-material/RestartAlt";

interface ExchangeRateDisplayCardProps {
  loading: boolean;
  editing: boolean;
  disabled?: boolean;
  amount: {
    currency: CurrencyCode;
    value: number;
  };
  exchange: {
    currency: CurrencyCode;
    rate: number;
  };
  showResetButton: boolean;
  onToggleEdit: () => void;
  onReset: () => void;
}

export default function ExchangeRateDisplayCard({
  loading,
  editing,
  disabled,
  amount,
  exchange,
  showResetButton,
  onToggleEdit,
  onReset,
}: ExchangeRateDisplayCardProps) {
  if (!amount) {
    return;
  }
  return (
    <Box
      sx={{
        display: "flex",
        width: "100%",
        p: 1,
        bgcolor: "grey.50",
        borderRadius: 1,
        border: 1,
        borderColor: "grey.300",
      }}
    >
      <Stack sx={{ flexGrow: 1 }}>
        <Typography variant="caption" color="text.secondary">
          Exchange rate:{" "}
          <Typography component="span" variant="caption" fontWeight="bold">
            {money.formatCurrency(exchange.currency)} 1 ={" "}
            {money.formatCurrency(amount.currency)} {exchange.rate}
          </Typography>
        </Typography>
        <Typography variant="caption" color="text.secondary">
          Converted amount:{" "}
          <Typography component="span" variant="caption" fontWeight="bold">
            {money.formatCurrency(exchange.currency)} {amount.value.toFixed(2)}{" "}
            (Base Currency){" "}
          </Typography>
        </Typography>
      </Stack>
      {!disabled ? (
        <Box display="flex" gap={0.5}>
          {/* Reset Button (only show if custom rate is set) */}
          {showResetButton && (
            <Tooltip title="Reset to default exchange rate">
              <IconButton
                size="small"
                onClick={onReset}
                color="default"
                disabled={false}
              >
                <RestartAltIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          )}

          {/* Edit/Check Button */}
          <Tooltip title={editing ? "Use this rate" : "Edit exchange rate"}>
            <IconButton
              size="small"
              onClick={onToggleEdit}
              color={editing ? "primary" : "default"}
              disabled={loading}
            >
              {editing ? (
                <CheckIcon fontSize="small" />
              ) : (
                <EditIcon fontSize="small" />
              )}
            </IconButton>
          </Tooltip>
        </Box>
      ) : null}
    </Box>
  );
}
