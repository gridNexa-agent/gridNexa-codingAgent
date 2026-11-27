// The code extension no longer adds `code__grep`. This keeps a structured
// search tool next to `bash`, named `grep`.
import { defineTool } from "eve/tools";
import { grep } from "eve/tools/grep";

export default defineTool({
  ...grep,
  description: grep.description + " Prefer this over running rg or grep in bash.",
});
