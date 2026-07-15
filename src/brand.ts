import brand from "../config/brand.json";

export type PortalBrand = typeof brand;
export const portalBrand: PortalBrand = Object.freeze(brand);
