import axios from "axios";
import { API_URL, API_URL_STATEFUL } from "./const";

export async function sendToGrok(
  apiKey: string,
  model: string,
  content: string,
  stateful: boolean
): Promise<any> {
  const url = stateful ? API_URL_STATEFUL : API_URL;
  const response = await axios.post(
    url,
    {
      messages: [{ role: "user", content }],
      model,
      stream: false,
      temperature: 0,
    },
    {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
    }
  );
  return response.data;
}
