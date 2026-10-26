import { naira } from "./format";

type Order = {
  eventTitle: string;
  guestName: string;
  lookLabel: string;
  size: string;
  qty: number;
  price: number | null;
  previewUrl?: string | null;
};

export function orderMessage(o: Order) {
  const total = o.price != null ? naira(o.price * o.qty) : null;
  return [
    `Hello! I'd like to order aso ebi for ${o.eventTitle}.`,
    "",
    `Name: ${o.guestName}`,
    `Style: ${o.lookLabel}`,
    `Size: ${o.size}`,
    `Quantity: ${o.qty}`,
    total ? `Total: ${total}` : null,
    o.previewUrl ? `My preview: ${o.previewUrl}` : null,
    "",
    "Sent from AsoLink",
  ]
    .filter((l) => l !== null)
    .join("\n");
}

export const waLink = (phone: string, text: string) => `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
