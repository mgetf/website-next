import type { Actions, PageServerLoad } from './$types';
import { requireStrictAdmin } from '$lib/server/auth/permissions';
import { z } from 'zod';
import { formError, validateForm, validationError } from '$lib/server/utils/forms';
import { getErrorMessage } from '$lib/server/utils/errors';
import { logAudit, AuditCategory, AuditAction } from '$lib/server/services/auditLog';
import { getFormatsForFilter } from '$lib/server/services/formats';
import { getRegions } from '$lib/server/services/regions';
import {
  getStaffMappings,
  isStaffRole,
  saveStaffMappings,
  type StaffDiscordRuleInput,
  type StaffRoleMappingInput,
  type StaffSourcebansServerInput,
} from '$lib/server/services/staff';
import {
  isSourcebansConfigured,
  listSourcebansGroups,
  listSourcebansServers,
} from '$lib/server/services/sourcebans';
import { isDiscordGuildConfigured, listDiscordGuildRoles } from '$lib/server/services/discordGuild';

function optionalId(value: string): number | null {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

const settingsSchema = z.object({
  moderatorServerGroupId: z.string().optional().default(''),
  moderatorWebGroupId: z.string().optional().default(''),
  moderatorImmunity: z.coerce.number().int().min(0).optional().default(0),
  moderatorDiscordRoleIds: z.array(z.string()).optional().default([]),
  adminServerGroupId: z.string().optional().default(''),
  adminWebGroupId: z.string().optional().default(''),
  adminImmunity: z.coerce.number().int().min(0).optional().default(0),
  adminDiscordRoleIds: z.array(z.string()).optional().default([]),
  discordRules: z.array(z.string()).optional().default([]),
  sourcebansServers: z.array(z.string()).optional().default([]),
});

function parseDiscordRuleToken(token: string): StaffDiscordRuleInput | null {
  const parts = token.split('|');
  if (parts.length !== 4) return null;
  const [permissionRaw, formatRaw, regionRaw, discordRoleId] = parts;
  if (!discordRoleId) return null;
  const permissionLevel = permissionRaw && isStaffRole(permissionRaw) ? permissionRaw : null;
  return {
    permissionLevel,
    formatId: optionalId(formatRaw ?? ''),
    regionId: optionalId(regionRaw ?? ''),
    discordRoleId,
  };
}

function parseServerToken(token: string): StaffSourcebansServerInput | null {
  const [regionRaw, serverRaw] = token.split(':');
  const regionId = optionalId(regionRaw ?? '');
  const sourcebansServerId = optionalId(serverRaw ?? '');
  if (regionId == null || sourcebansServerId == null) return null;
  return { regionId, sourcebansServerId };
}

export const load: PageServerLoad = async ({ locals }) => {
  requireStrictAdmin(locals.user);

  const sourcebansConfigured = isSourcebansConfigured();
  const discordConfigured = isDiscordGuildConfigured();

  const [mappings, formats, regions, sourcebansGroups, sourcebansServers, discordRoles] =
    await Promise.all([
      getStaffMappings(),
      getFormatsForFilter(),
      getRegions(),
      sourcebansConfigured
        ? listSourcebansGroups().catch((err: unknown) => {
            console.error('[staff settings] groups', err);
            return { web: [], server: [] };
          })
        : Promise.resolve({ web: [], server: [] }),
      sourcebansConfigured
        ? listSourcebansServers().catch((err: unknown) => {
            console.error('[staff settings] servers', err);
            return [];
          })
        : Promise.resolve([]),
      discordConfigured
        ? listDiscordGuildRoles().catch((err: unknown) => {
            console.error('[staff settings] discord roles', err);
            return [];
          })
        : Promise.resolve([]),
    ]);

  return {
    sourcebansConfigured,
    discordConfigured,
    mappings,
    formats: formats.map((format) => ({ id: format.id, name: format.name })),
    regions: regions.map((region) => ({ id: region.id, name: region.name })),
    sourcebansGroups,
    sourcebansServers: sourcebansServers.map((server) => ({
      id: server.id,
      label: server.hostname
        ? `${server.hostname} (${server.ip}:${server.port})`
        : `${server.ip}:${server.port}`,
    })),
    discordRoles: discordRoles.map((role) => ({ id: role.id, name: role.name })),
  };
};

export const actions: Actions = {
  save: async ({ request, locals, getClientAddress }) => {
    requireStrictAdmin(locals.user);

    const formData = await request.formData();
    const validation = validateForm(formData, settingsSchema, [
      'moderatorDiscordRoleIds',
      'adminDiscordRoleIds',
      'discordRules',
      'sourcebansServers',
    ]);
    if (!validation.success) return validationError(validation.errors);

    const values = validation.data;
    const discordRules = values.discordRules
      .map(parseDiscordRuleToken)
      .filter((row): row is StaffDiscordRuleInput => row !== null);
    const sourcebansServers = values.sourcebansServers
      .map(parseServerToken)
      .filter((row): row is StaffSourcebansServerInput => row !== null);

    const roleMappings: StaffRoleMappingInput[] = [
      {
        permissionLevel: 'MODERATOR',
        sourcebansServerGroupId: optionalId(values.moderatorServerGroupId),
        sourcebansWebGroupId: optionalId(values.moderatorWebGroupId),
        sourcebansImmunity: values.moderatorImmunity,
        discordRoleIds: values.moderatorDiscordRoleIds.filter(Boolean),
      },
      {
        permissionLevel: 'ADMIN',
        sourcebansServerGroupId: optionalId(values.adminServerGroupId),
        sourcebansWebGroupId: optionalId(values.adminWebGroupId),
        sourcebansImmunity: values.adminImmunity,
        discordRoleIds: values.adminDiscordRoleIds.filter(Boolean),
      },
    ];

    try {
      await saveStaffMappings({ roleMappings, discordRules, sourcebansServers });

      await logAudit({
        actorId: locals.user.steamId,
        actorRole: locals.user.permissionLevel,
        category: AuditCategory.STAFF,
        action: AuditAction.STAFF_MAPPING_UPDATED,
        targetType: 'StaffMappings',
        targetId: 'default',
        ipAddress: getClientAddress(),
      });

      return { success: true, message: 'Staff mappings saved.' };
    } catch (error) {
      return formError(getErrorMessage(error, 'Failed to save mappings'), 400);
    }
  },
};
