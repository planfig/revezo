import { registerPlugin } from "../../core/registry.ts";
import { brevo } from "./brevo.ts";
import { mailjet } from "./mailjet.ts";
import { smtp } from "./smtp.ts";

export * from "./message.ts";
export { brevo, mailjet, smtp };

export function registerEmailPlugins(): void {
  for (const p of [brevo, mailjet, smtp]) registerPlugin(p);
}
