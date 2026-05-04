import {
  pgTable,
  uuid,
  text,
  timestamp,
  boolean,
  jsonb,
  date,
  primaryKey,
  uniqueIndex,
  index,
  bigint,
  inet,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

const ts = (name: string) => timestamp(name, { withTimezone: true });

export const businesses = pgTable(
  'businesses',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    slug: text('slug').notNull().unique(),
    legalName: text('legal_name').notNull(),
    tradeName: text('trade_name').notNull(),
    rnc: text('rnc'),
    countryCode: text('country_code').notNull().default('DO'),
    defaultCurrency: text('default_currency').notNull().default('DOP'),
    defaultLocale: text('default_locale').notNull().default('es-DO'),
    defaultTimezone: text('default_timezone').notNull().default('America/Santo_Domingo'),
    contactEmail: text('contact_email'),
    contactPhone: text('contact_phone'),
    contactWhatsapp: text('contact_whatsapp'),
    websiteUrl: text('website_url'),
    instagramHandle: text('instagram_handle'),
    logoUrl: text('logo_url'),
    brandPrimary: text('brand_primary'),
    brandAccent: text('brand_accent'),
    status: text('status').notNull().default('active'),
    dgiiEnabled: boolean('dgii_enabled').notNull().default(false),
    createdAt: ts('created_at').notNull().defaultNow(),
    updatedAt: ts('updated_at').notNull().defaultNow(),
    deletedAt: ts('deleted_at'),
  },
  (t) => ({
    statusIdx: index('idx_businesses_status').on(t.status),
  }),
);

export const branches = pgTable(
  'branches',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    businessId: uuid('business_id').notNull().references(() => businesses.id, { onDelete: 'cascade' }),
    code: text('code').notNull(),
    name: text('name').notNull(),
    address: text('address'),
    city: text('city'),
    province: text('province'),
    countryCode: text('country_code').notNull().default('DO'),
    phone: text('phone'),
    whatsapp: text('whatsapp'),
    email: text('email'),
    isMain: boolean('is_main').notNull().default(false),
    status: text('status').notNull().default('active'),
    createdAt: ts('created_at').notNull().defaultNow(),
    updatedAt: ts('updated_at').notNull().defaultNow(),
    deletedAt: ts('deleted_at'),
  },
  (t) => ({
    businessCode: uniqueIndex('uniq_branches_business_code').on(t.businessId, t.code),
    businessIdx: index('idx_branches_business').on(t.businessId),
  }),
);

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey(),
    businessId: uuid('business_id').notNull().references(() => businesses.id, { onDelete: 'cascade' }),
    defaultBranchId: uuid('default_branch_id').references(() => branches.id, { onDelete: 'set null' }),
    email: text('email').notNull(),
    fullName: text('full_name').notNull(),
    phone: text('phone'),
    avatarUrl: text('avatar_url'),
    status: text('status').notNull().default('active'),
    invitedAt: ts('invited_at'),
    invitedBy: uuid('invited_by'),
    lastLoginAt: ts('last_login_at'),
    createdAt: ts('created_at').notNull().defaultNow(),
    updatedAt: ts('updated_at').notNull().defaultNow(),
    deletedAt: ts('deleted_at'),
  },
  (t) => ({
    businessEmail: uniqueIndex('uniq_users_business_email').on(t.businessId, t.email),
    businessIdx: index('idx_users_business').on(t.businessId),
  }),
);

export const businessRoles = pgTable(
  'business_roles',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    businessId: uuid('business_id').notNull().references(() => businesses.id, { onDelete: 'cascade' }),
    code: text('code').notNull(),
    name: text('name').notNull(),
    description: text('description'),
    isBuiltIn: boolean('is_built_in').notNull().default(false),
    createdAt: ts('created_at').notNull().defaultNow(),
    updatedAt: ts('updated_at').notNull().defaultNow(),
  },
  (t) => ({
    businessCode: uniqueIndex('uniq_business_roles_code').on(t.businessId, t.code),
  }),
);

export const permissions = pgTable('permissions', {
  code: text('code').primaryKey(),
  module: text('module').notNull(),
  description: text('description').notNull(),
  isDestructive: boolean('is_destructive').notNull().default(false),
});

export const rolePermissions = pgTable(
  'role_permissions',
  {
    roleId: uuid('role_id').notNull().references(() => businessRoles.id, { onDelete: 'cascade' }),
    permissionCode: text('permission_code').notNull().references(() => permissions.code),
    grantedAt: ts('granted_at').notNull().defaultNow(),
  },
  (t) => ({ pk: primaryKey({ columns: [t.roleId, t.permissionCode] }) }),
);

export const auditLogs = pgTable(
  'audit_logs',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    businessId: uuid('business_id').notNull().references(() => businesses.id, { onDelete: 'cascade' }),
    branchId: uuid('branch_id').references(() => branches.id, { onDelete: 'set null' }),
    actorId: uuid('actor_id'),
    actorType: text('actor_type').notNull().default('user'),
    action: text('action').notNull(),
    resourceType: text('resource_type').notNull(),
    resourceId: text('resource_id'),
    beforeState: jsonb('before_state'),
    afterState: jsonb('after_state'),
    metadata: jsonb('metadata'),
    ipAddress: inet('ip_address'),
    userAgent: text('user_agent'),
    createdAt: ts('created_at').notNull().defaultNow(),
  },
  (t) => ({
    businessCreated: index('idx_audit_business_created').on(t.businessId, t.createdAt),
    resourceIdx: index('idx_audit_resource').on(t.businessId, t.resourceType, t.resourceId),
  }),
);

export const clients = pgTable(
  'clients',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    businessId: uuid('business_id').notNull().references(() => businesses.id, { onDelete: 'cascade' }),
    branchId: uuid('branch_id').references(() => branches.id, { onDelete: 'set null' }),
    displayCode: text('display_code').notNull(),
    fullName: text('full_name').notNull(),
    documentType: text('document_type'),
    documentNumber: text('document_number'),
    email: text('email'),
    phone: text('phone'),
    whatsapp: text('whatsapp'),
    birthDate: date('birth_date'),
    sex: text('sex'),
    address: text('address'),
    city: text('city'),
    notes: text('notes'),
    tags: text('tags').array().notNull().default(sql`'{}'`),
    createdAt: ts('created_at').notNull().defaultNow(),
    updatedAt: ts('updated_at').notNull().defaultNow(),
    deletedAt: ts('deleted_at'),
  },
  (t) => ({
    businessCode: uniqueIndex('uniq_clients_business_code').on(t.businessId, t.displayCode),
    businessIdx: index('idx_clients_business').on(t.businessId),
  }),
);

export type Business = typeof businesses.$inferSelect;
export type Branch = typeof branches.$inferSelect;
export type AppUser = typeof users.$inferSelect;
export type BusinessRole = typeof businessRoles.$inferSelect;
export type Client = typeof clients.$inferSelect;
export type AuditLog = typeof auditLogs.$inferSelect;
