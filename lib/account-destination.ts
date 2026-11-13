export function accountDestination(roles: readonly string[]) {
  if (roles.includes("SUPER_ADMIN")) return "/super-admin";
  if (roles.includes("BUSINESS_OWNER")) return "/panel-negocio";
  return "/mi-cuenta";
}
