package com.campushub.userservice.user.dto;

import org.springframework.data.domain.Page;

import java.util.List;
import java.util.function.Function;

/**
 * Generic API pagination envelope. Spring Data's {@link Page}/{@link org.springframework.data.domain.Pageable}
 * remain the backend pagination foundation — this type only shapes the JSON returned to API
 * clients.
 *
 * <p>Convention: {@code ?page=0&size=20&sort=name,asc}, using Spring's standard zero-based page
 * index (never silently switched to one-based).
 */
public record PageResponse<T>(
        List<T> content,
        int page,
        int size,
        long totalElements,
        int totalPages,
        boolean first,
        boolean last
) {

    public static <T> PageResponse<T> from(Page<T> page) {
        return from(page, Function.identity());
    }

    public static <T, R> PageResponse<R> from(Page<T> page, Function<? super T, R> mapper) {
        List<R> mappedContent = page.getContent().stream().map(mapper).toList();

        return new PageResponse<>(
                mappedContent,
                page.getNumber(),
                page.getSize(),
                page.getTotalElements(),
                page.getTotalPages(),
                page.isFirst(),
                page.isLast());
    }

}
