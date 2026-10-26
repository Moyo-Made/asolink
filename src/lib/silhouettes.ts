export type Silhouette = {
  id: string;
  label: string;
  description: string;
};

export const SILHOUETTES: Silhouette[] = [
  { id: "kaftan", label: "Kaftan", description: "Long, straight, long sleeves. Works for men and women." },
  { id: "gown", label: "Fitted gown", description: "Fitted body with flared sleeves." },
  { id: "maxi", label: "Long gown", description: "Off the shoulder, long sleeves, full length." },
];

export const silhouetteById = (id: string) => SILHOUETTES.find((s) => s.id === id);
