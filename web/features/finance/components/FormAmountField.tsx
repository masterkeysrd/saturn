import Typography from "@mui/material/Typography";
import FormNumberField, {
  type NumberFieldProps,
} from "@/components/FormNumberField";
import { money, type CurrencyCode } from "@/lib/money";

interface FormAmountFieldProps
  extends Omit<NumberFieldProps, "startAdornment"> {
  currency?: CurrencyCode;
}

export default function FormAmountField({
  currency,
  ...rest
}: FormAmountFieldProps) {
  return (
    <FormNumberField
      {...rest}
      startAdornment={
        currency && (
          <Typography variant="body2" fontWeight="medium">
            {money.formatCurrency(currency)}
          </Typography>
        )
      }
    />
  );
}
