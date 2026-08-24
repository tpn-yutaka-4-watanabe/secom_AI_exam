export function expectedAdminPath() {
  return process.env.ADMIN_PATH?.trim() || "preview";
}

export function expectedAdminPassword() {
  return process.env.ADMIN_PASSWORD?.trim() || "grade4-preview";
}

export function isAdminRequest(headers: Headers) {
  return headers.get("x-admin-path") === expectedAdminPath()
    && headers.get("x-admin-password") === expectedAdminPassword();
}
