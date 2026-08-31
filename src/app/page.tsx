import { redirect } from "next/navigation";
import { defaultLocale } from "@/i18n/config";

// The apex path always resolves to a locale. Arabic is the default and the
// canonical conversion path.
export default function RootPage() {
  redirect(`/${defaultLocale}`);
}
