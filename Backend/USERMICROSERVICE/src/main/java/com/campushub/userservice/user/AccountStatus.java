package com.campushub.userservice.user;

/**
 * <ul>
 *   <li>{@link #PENDING_APPROVAL} — a self-registered student waiting for an administrator.</li>
 *   <li>{@link #ACTIVE} — the only status that can log in.</li>
 *   <li>{@link #SUSPENDED} — blocked by an administrator; can be reactivated.</li>
 * </ul>
 */
public enum AccountStatus {

    PENDING_APPROVAL,
    ACTIVE,
    SUSPENDED

}
