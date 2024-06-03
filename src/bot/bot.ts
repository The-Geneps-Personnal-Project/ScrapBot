import CustomClient from "./classes/client";
import { config } from "dotenv";

config();

const client = new CustomClient();

client.start();
