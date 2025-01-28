import styled from "@mui/material/styles/styled";
import Box from "@mui/material/Box";

export interface FormProps {
  children?: React.ReactNode;
  onSubmit?: (event: React.FormEvent<HTMLFormElement>) => void;
}

export const Form = ({ children, onSubmit }: FormProps) => {
  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSubmit?.(event);
  };

  return (
    <Box component="form" onSubmit={handleSubmit}>
      <FormContainer>{children}</FormContainer>
    </Box>
  );
};

const FormContainer = styled(Box)({
  display: "flex",
  flexDirection: "column",
});

export default Form;
