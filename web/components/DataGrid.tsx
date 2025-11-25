import {
  DataGrid as MuiDataGrid,
  type DataGridProps as MuiDataGridProps,
  gridClasses,
} from "@mui/x-data-grid";

type DataGridProps = Omit<MuiDataGridProps, "sx">;

export default function DataGrid(props: DataGridProps) {
  return (
    <MuiDataGrid
      pagination
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
      {...props}
    />
  );
}

// Export types and components for convenience.
export { GridActionsCellItem, type GridColDef } from "@mui/x-data-grid";
