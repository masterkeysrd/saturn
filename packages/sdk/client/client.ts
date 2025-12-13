import axios, { type AxiosInstance } from "axios";

let instance = axios.create({
  headers: { "Content-Type": "application/json" },
});

export const getAxios = () => {
  return instance;
};

export const setAxios = (newInstance: AxiosInstance) => {
  instance = newInstance;
};
