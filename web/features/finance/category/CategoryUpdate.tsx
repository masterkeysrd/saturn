import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import FormControlLabel from "@mui/material/FormControlLabel";
import Radio from "@mui/material/Radio";
import { useNavigate, useParams } from "react-router";
import { Category } from "./Category.model";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createCategory,
  getCategory,
  updateCategory,
} from "./Category.service";
import { useSnackbar } from "notistack";

import { useForm } from "react-hook-form";
import FormTextField from "@/components/FormTextField";
import FormRadioGroup from "@/components/FormRadioGroup";

const form = {
  name: {
    required: "Name is required",
  },
  amount: {
    required: "Amount is required",
    min: 1,
  },
};

export const CategoryUpdate = () => {
  const navigate = useNavigate();
  const { enqueueSnackbar } = useSnackbar();

  const { id } = useParams<"id">();
  const isNew = id === undefined;
  const title = isNew ? "Create Category" : "Edit Category";

  const queryClient = useQueryClient();
  const { data: category, isLoading } = useQuery({
    enabled: !isNew,
    queryKey: ["categorys", id],
    queryFn: async () => getCategory(id!),
  });

  const { register, formState, control, handleSubmit } = useForm<Category>({
    mode: "onSubmit",
    values: isNew ? {} : { ...category },
  });

  const createCategoryMutation = useMutation({
    mutationFn: createCategory,
    onSuccess: () => handleSaveSuccess(),
  });

  const updateCategoryMutation = useMutation({
    mutationFn: updateCategory,
    onSuccess: () => handleSaveSuccess(),
  });

  const handleSave = (category: Category) => {
    const data = { ...category };
    if (isNew) {
      createCategoryMutation.mutate(data);
    } else {
      updateCategoryMutation.mutate(data);
    }
  };

  const handleSaveSuccess = () => {
    // Show a success message
    enqueueSnackbar(isNew ? "Category created" : "Category updated", {
      variant: "success",
    });

    // Invalidate the cache and navigate back to the list
    queryClient.invalidateQueries({ queryKey: ["categories"] });

    // Close the dialog
    handleClose();
  };

  const handleClose = () => {
    navigate("/finance/category");
  };

  if (isLoading) {
    return <div>Loading...</div>;
  }

  return (
    <Dialog
      open={true}
      onClose={handleClose}
      PaperProps={{
        component: "form",
        onSubmit: handleSubmit(handleSave),
        sx: { minWidth: 400 },
      }}
    >
      <DialogTitle>{title}</DialogTitle>
      <DialogContent
        dividers
        sx={{ display: "flex", flexDirection: "column", gap: 2 }}
      >
        <FormRadioGroup label="Type" name="type" control={control} row>
          <FormControlLabel
            value="expense"
            control={<Radio />}
            label="Expense"
          />
          <FormControlLabel value="income" control={<Radio />} label="Income" />
        </FormRadioGroup>
        <FormTextField
          label="Name"
          autoFocus
          fullWidth
          {...register("name", form.name)}
          error={formState.errors.name}
        />
      </DialogContent>
      <DialogActions sx={{ my: 1 }}>
        <Button color="error" variant="contained" onClick={handleClose}>
          Cancel
        </Button>
        <Button color="primary" variant="contained" type="submit">
          Save
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default CategoryUpdate;
