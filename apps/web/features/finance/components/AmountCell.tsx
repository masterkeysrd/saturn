import { money, type Money } from "@/lib/money";
import Stack from "@mui/material/Stack";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";

export default function AmountCell({
  amount,
  baseAmount,
  exchangeRate,
}: {
  amount: Money;
  baseAmount: Money;
  exchangeRate?: number;
}) {
  const sameCurrency =
    amount?.currencyCode === baseAmount?.currencyCode || exchangeRate === 1;

  if (sameCurrency) {
    return <Typography variant="body2">{money.format(amount)}</Typography>;
  }

  return (
    <Stack spacing={0.25}>
      <Stack direction="row" spacing={0.5} alignItems="center">
        <Typography variant="body2" fontWeight="medium">
          {money.format(amount)}
        </Typography>
        {exchangeRate ? (
          <Tooltip
            title={`Exchange rate: ${exchangeRate?.toFixed(2)}`}
            placement="top"
          >
            <InfoOutlinedIcon
              sx={{ fontSize: 14, color: "text.secondary", cursor: "help" }}
            />
          </Tooltip>
        ) : null}
      </Stack>
      <Typography variant="caption" color="text.secondary">
        ≈ {money.format(baseAmount)}
      </Typography>
    </Stack>
  );
}
