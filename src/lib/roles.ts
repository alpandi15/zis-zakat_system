// Application-level role definitions
// These define the role hierarchy and permissions at the frontend level

export type AppRole = 'super_admin' | 'chairman' | 'treasurer' | 'zakat_officer' | 'fidyah_officer' | 'viewer';

// Role categories
export const ADMIN_ROLES: AppRole[] = ['super_admin', 'chairman'];
export const PETUGAS_ROLES: AppRole[] = ['treasurer', 'zakat_officer', 'fidyah_officer', 'viewer'];

// Default role assigned to new users
export const DEFAULT_ROLE: AppRole = 'viewer';

// Role display names (Indonesian)
export const ROLE_LABELS: Record<AppRole, string> = {
  super_admin: 'Super Admin',
  chairman: 'Ketua',
  treasurer: 'Bendahara',
  zakat_officer: 'Petugas Zakat',
  fidyah_officer: 'Petugas Fidyah',
  viewer: 'Viewer',
};

// Role descriptions
export const ROLE_DESCRIPTIONS: Record<AppRole, string> = {
  super_admin: 'Akses penuh ke semua fitur dan pengaturan sistem',
  chairman: 'Akses penuh ke semua fitur sebagai ketua',
  treasurer: 'Mengelola keuangan dan laporan',
  zakat_officer: 'Mengelola transaksi dan distribusi zakat',
  fidyah_officer: 'Mengelola transaksi dan distribusi fidyah',
  viewer: 'Hanya dapat melihat data',
};

// Permission helpers
export const isAdminRole = (role: AppRole): boolean => ADMIN_ROLES.includes(role);
export const isPetugasRole = (role: AppRole): boolean => PETUGAS_ROLES.includes(role);

export const hasAdminAccess = (roles: AppRole[]): boolean => 
  roles.some(role => ADMIN_ROLES.includes(role));

export const hasPetugasAccess = (roles: AppRole[]): boolean => 
  roles.some(role => PETUGAS_ROLES.includes(role));

// Check if user can manage periods (admin only)
export const canManagePeriods = (roles: AppRole[]): boolean => hasAdminAccess(roles);

// Check if user can manage members/transactions
export const canManageData = (roles: AppRole[]): boolean => 
  roles.some(role => ['super_admin', 'chairman', 'treasurer', 'zakat_officer', 'fidyah_officer'].includes(role));

// All available roles for selection (used in admin UI)
export const ALL_ROLES: AppRole[] = [
  'super_admin',
  'chairman', 
  'treasurer',
  'zakat_officer',
  'fidyah_officer',
  'viewer',
];
