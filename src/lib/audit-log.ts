// ============================================================================
// iBetPro Audit Logger
// Every financial operation is logged for compliance and debugging
// ============================================================================

import { prisma } from "./db";

export type AuditAction =
  | "bet_placed"
  | "bet_settled"
  | "bet_cashout"
  | "bet_partial_cashout"
  | "commission_calculated"
  | "commission_transferred"
  | "commission_transfer_failed"
  | "allocation_set"
  | "allocation_released"
  | "broker_connected"
  | "broker_disconnected"
  | "broker_session_refreshed"
  | "broker_auth_failed"
  | "broker_balance_synced"
  | "user_login"
  | "user_register"
  | "settings_updated"
  | "auto_bet_started"
  | "auto_bet_stopped"
  | "risk_limit_hit"
  | "stop_loss_triggered"
  | "profit_target_hit";

export interface AuditLogEntry {
  userId: string;
  action: AuditAction;
  entityType?: string;
  entityId?: string;
  details?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
}

/**
 * Log an audit event
 */
export async function auditLog(entry: AuditLogEntry): Promise<void> {
  try {
    // Create a BotLog entry (reusing existing schema for audit trail)
    await prisma.botLog.create({
      data: {
        userId: entry.userId,
        action: entry.action,
        matchId: entry.entityId || null,
        details: entry.details ? JSON.stringify(entry.details) : null,
        reasoning: entry.metadata ? JSON.stringify(entry.metadata) : null,
        confidence: entry.entityType ? 1 : 0,
        profitImpact: 0,
      },
    });
  } catch (error) {
    // Audit logging should never fail the main operation
    console.error("Audit log failed:", error);
  }
}

/**
 * Log a financial operation (bet placement, cashout, commission)
 */
export async function logFinancialOperation(params: {
  userId: string;
  action: AuditAction;
  entityType: string;
  entityId: string;
  amount: number;
  currency: string;
  status: "success" | "failed" | "pending";
  brokerPlatform?: string;
  brokerBetId?: string;
  error?: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  await auditLog({
    userId: params.userId,
    action: params.action,
    entityType: params.entityType,
    entityId: params.entityId,
    details: {
      amount: params.amount,
      currency: params.currency,
      status: params.status,
      brokerPlatform: params.brokerPlatform,
      brokerBetId: params.brokerBetId,
      error: params.error,
      timestamp: new Date().toISOString(),
    },
    metadata: params.metadata,
  });
}

/**
 * Log a broker connection event
 */
export async function logBrokerEvent(params: {
  userId: string;
  action: AuditAction;
  brokerPlatform: string;
  brokerUserId?: string;
  status: "success" | "failed";
  error?: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  await auditLog({
    userId: params.userId,
    action: params.action,
    entityType: "broker_account",
    entityId: params.brokerPlatform,
    details: {
      brokerPlatform: params.brokerPlatform,
      brokerUserId: params.brokerUserId,
      status: params.status,
      error: params.error,
      timestamp: new Date().toISOString(),
    },
    metadata: params.metadata,
  });
}

/**
 * Get audit trail for a user
 */
export async function getAuditTrail(
  userId: string,
  options?: {
    action?: AuditAction;
    limit?: number;
    offset?: number;
    startDate?: Date;
    endDate?: Date;
  }
) {
  const where: Record<string, unknown> = { userId };

  if (options?.action) {
    where.action = options.action;
  }

  if (options?.startDate || options?.endDate) {
    where.createdAt = {};
    if (options.startDate) (where.createdAt as Record<string, unknown>).gte = options.startDate;
    if (options.endDate) (where.createdAt as Record<string, unknown>).lte = options.endDate;
  }

  const logs = await prisma.botLog.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: options?.limit || 50,
    skip: options?.offset || 0,
  });

  const total = await prisma.botLog.count({ where });

  return { logs, total };
}
