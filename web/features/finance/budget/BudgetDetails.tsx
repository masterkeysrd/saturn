import { useQuery } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router";

import Box from "@mui/material/Box";
import Drawer from "@mui/material/Drawer";
import IconButton from "@mui/material/IconButton";
import Typography from "@mui/material/Typography";

import CloseIcon from "@mui/icons-material/Close";

import money from "../../../lib/money";
import { getBudget } from "./Budget.service";

export const BudgetDetails = () => {
  const navigate = useNavigate();

  const { id } = useParams<"id">();

  const { data: budget, isLoading: isLoadingBudget } = useQuery({
    queryKey: ["budget", id],
    queryFn: () => getBudget(id!),
  });

  const handleClose = () => {
    navigate("/finance/budget");
  };

  if (isLoadingBudget) {
    return <div>Loading...</div>;
  }

  if (!budget) {
    // TODO: Add a 404 page
    return <div>Budget not found</div>;
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
          <Typography variant="h6">Budget Details</Typography>
          <IconButton onClick={handleClose}>
            <CloseIcon />
          </IconButton>
        </Box>
        <Box component="dl">
          <Typography component="dt" variant="subtitle2">
            ID
          </Typography>
          <Typography component="dd" variant="body2" sx={{ mb: 2 }}>
            {budget.id}
          </Typography>
          <Typography component="dt" variant="subtitle2">
            Description
          </Typography>
          <Typography component="dd" variant="body2" sx={{ mb: 2 }}>
            {budget.description}
          </Typography>
          <Typography component="dt" variant="subtitle2">
            Amount
          </Typography>
          <Typography component="dd" variant="body2" sx={{ mb: 2 }}>
            {money.format(budget.amount)}
          </Typography>
        </Box>
      </Box>
    </Drawer>
  );
};

export default BudgetDetails;
