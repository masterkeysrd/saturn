import { CssBaseline } from "@mui/material"
import router from "./router";
import { RouterProvider } from "react-router";


function App() {
    return (
        <>
            <CssBaseline />
            <RouterProvider router={router} />
        </>
    )
}

export default App
