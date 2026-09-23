import { readConfig } from "../server/config";
import { handleRequest } from "../server/handler";

export default {
  fetch(request: Request) {
    return handleRequest(request, readConfig());
  },
};
