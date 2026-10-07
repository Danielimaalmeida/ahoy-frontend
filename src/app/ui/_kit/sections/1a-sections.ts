import type { KitSection } from "../kit-section";
import { KitBanner } from "./1a-banner";
import { KitBrand } from "./1a-brand";
import { KitButton } from "./1a-button";
import { KitField } from "./1a-field";
import { KitPanel } from "./1a-panel";
import { KitTable } from "./1a-table";

/** Lane 1A's gallery sections, in page order. */
export const KIT_SECTIONS_1A: readonly KitSection[] = [
  { id: "brand", title: "Logo and icons", lane: "1A", component: KitBrand },
  { id: "button", title: "Button", lane: "1A", component: KitButton },
  { id: "panel", title: "Panel", lane: "1A", component: KitPanel },
  { id: "field", title: "Field", lane: "1A", component: KitField },
  { id: "banner", title: "Banner", lane: "1A", component: KitBanner },
  { id: "table", title: "DataTable and tags", lane: "1A", component: KitTable },
];
