package com.campushub.userservice.support;

import java.lang.reflect.Field;
import java.util.UUID;

/**
 * Test-only helper to assign the (JPA-generated, setter-less) {@code id} field on domain entities
 * directly, so unit tests can build fully-formed entity instances without a real persistence
 * context to generate ids for them.
 */
public final class EntityIdSupport {

    private EntityIdSupport() {
    }

    public static void assignId(Object entity, UUID id) {
        try {
            Field field = entity.getClass().getDeclaredField("id");
            field.setAccessible(true);
            field.set(entity, id);
        } catch (ReflectiveOperationException e) {
            throw new IllegalStateException("Could not assign id on " + entity.getClass(), e);
        }
    }

}
