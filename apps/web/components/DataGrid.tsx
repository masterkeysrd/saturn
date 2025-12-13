import { type Pagination } from "@/lib/pagination";
import {
  DataGrid as MuiDataGrid,
  type DataGridProps as MuiDataGridProps,
  gridClasses,
  type GridPaginationModel,
} from "@mui/x-data-grid";

interface DataGridProps
  extends Omit<
    MuiDataGridProps,
    | "sx"
    | "paginationModel"
    | "onPaginationModelChange"
    | "paginationMode"
    | "sortingMode"
    | "filterMode"
  > {
  paginationState?: Pagination;
  onPaginationChange?: (paginationState: Pagination) => void;
}

export default function DataGrid({
  paginationState,
  onPaginationChange,
  ...rest
}: DataGridProps) {
  const paginationModel: GridPaginationModel = {
    page: (paginationState?.page ?? 1) - 1,
    pageSize: paginationState?.size ?? 0,
  };

  const handlePaginationChange = (model: GridPaginationModel) => {
    onPaginationChange?.({
      page: model.page + 1,
      size: model.pageSize,
    });
  };

  return (
    <MuiDataGrid
      pagination
      onPaginationModelChange={handlePaginationChange}
      paginationModel={paginationModel}
      paginationMode="server"
      sortingMode="server"
      filterMode="server"
      sx={{
        overflow: "clip",
        "--DataGrid-overlayHeight": "300px",
        [`& .${gridClasses.cell}`]: {
          display: "flex",
          alignItems: "center",
          py: 1,
        },
        [`& .${gridClasses.columnHeader}, & .${gridClasses.cell}`]: {
          outline: "transparent",
        },
        [`& .${gridClasses.columnHeader}:focus-within, & .${gridClasses.cell}:focus-within`]:
          {
            outline: "none",
          },
        [`& .${gridClasses.row}:hover`]: {
          cursor: "pointer",
        },
      }}
      {...rest}
    />
  );
}

// Export types and components for convenience.
export {
  GridActionsCellItem,
  type GridColDef,
  Toolbar,
  type GridToolbarProps,
} from "@mui/x-data-grid";
