import { useQuery } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router";

import Box from "@mui/material/Box";
import Drawer from "@mui/material/Drawer";
import IconButton from "@mui/material/IconButton";
import Typography from "@mui/material/Typography";

import CloseIcon from "@mui/icons-material/Close";

import money from "../../../lib/money";
import { getIncome } from "./Income.service";

export const IncomeDetails = () => {
  const navigate = useNavigate();

  const { id } = useParams<"id">();

  const { data: income, isLoading: isLoadingIncome } = useQuery({
    queryKey: ["income", id],
    queryFn: () => getIncome(id!),
  });

  const handleClose = () => {
    navigate("/finance/income");
  };

  if (isLoadingIncome) {
    return <div>Loading...</div>;
  }

  if (!income) {
    // TODO: Add a 404 page
    return <div>Income not found</div>;
  }

  return (
    <Drawer anchor="right" open onClose={handleClose}>
      <Box sx={{ width: 400, p: 2 }}>
        <Box
          sx={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <Typography variant="h6">Income Details</Typography>
          <IconButton onClick={handleClose}>
            <CloseIcon />
          </IconButton>
        </Box>
        <Box component="dl">
          <Typography component="dt" variant="subtitle2">
            ID
          </Typography>
          <Typography component="dd" variant="body2" sx={{ mb: 2 }}>
            {income.id}
          </Typography>
          <Typography component="dt" variant="subtitle2">
            Name
          </Typography>
          <Typography component="dd" variant="body2" sx={{ mb: 2 }}>
            {income.name}
          </Typography>
          <Typography component="dt" variant="subtitle2">
            Amount
          </Typography>
          <Typography component="dd" variant="body2" sx={{ mb: 2 }}>
            {money.format(income.amount)}
          </Typography>
        </Box>
      </Box>
    </Drawer>
  );
};

export default IncomeDetails;
