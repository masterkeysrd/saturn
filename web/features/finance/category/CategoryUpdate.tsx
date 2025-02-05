import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import FormControlLabel from "@mui/material/FormControlLabel";
import Radio from "@mui/material/Radio";
import { useNavigate, useParams } from "react-router";
import { Category, CategoryType } from "./Category.model";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createCategory,
  getCategory,
  updateCategory,
} from "./Category.service";
import { useSnackbar } from "notistack";

import { useForm } from "react-hook-form";
import FormTextField from "@/components/FormTextField";

const form = {
  name: {
    required: "Name is required",
  },
};

type CategoryUpdateProps = {
  type: CategoryType;
};

export const CategoryUpdate = ({ type }: CategoryUpdateProps) => {
  const navigate = useNavigate();
  const { enqueueSnackbar } = useSnackbar();

  const { id } = useParams<"id">();
  const isNew = id === undefined;
  const capitalized = type.charAt(0).toUpperCase() + type.slice(1);
  const title = isNew
    ? `Create ${capitalized} Category`
    : `Edit ${capitalized} Category`;

  const queryClient = useQueryClient();
  const { data: category, isLoading } = useQuery({
    enabled: !isNew,
    queryKey: ["categorys", id],
    queryFn: async () => getCategory(type, id!),
  });

  const { register, formState, handleSubmit } = useForm<Category>({
    mode: "onSubmit",
    values: isNew ? {} : { ...category },
  });

  const createCategoryMutation = useMutation({
    mutationFn: (data: Category) => createCategory(type, data),
    onSuccess: () => handleSaveSuccess(),
  });

  const updateCategoryMutation = useMutation({
    mutationFn: (data: Category) => updateCategory(type, data),
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
    queryClient.invalidateQueries({ queryKey: ["categories", type] });

    // Close the dialog
    handleClose();
  };

  const handleClose = () => {
    navigate(`/finance/category/${type}`);
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
