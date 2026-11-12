package com.campushub.apigateway;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.TreeMap;
import java.util.TreeSet;
import java.util.function.Function;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Collectors;
import java.util.stream.IntStream;

import org.junit.jupiter.api.Test;
import org.springframework.boot.env.PropertiesPropertySourceLoader;
import org.springframework.cloud.gateway.server.mvc.filter.BeforeFilterFunctions;
import org.springframework.core.env.PropertySource;
import org.springframework.core.io.ClassPathResource;
import org.springframework.http.server.PathContainer;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.web.servlet.function.ServerRequest;
import org.springframework.web.util.pattern.PathPatternParser;

/**
 * Garde-fou des routes de application.properties, sans demarrer Spring.
 *
 * Deux branches qui ajoutent chacune routes[6] fusionnent sans conflit Git ; or une cle en double
 * ne garde que sa derniere valeur, et une route disparait en silence (Enrollment / Reclamation).
 */
class GatewayRoutesTests {

	private static final String FILE = "application.properties";
	private static final String PREFIX = "spring.cloud.gateway.server.webmvc.routes[";
	private static final Pattern ROUTE_KEY = Pattern.compile("^" + Pattern.quote(PREFIX) + "(\\d+)\\]\\.(.+)$");

	/** Cles telles qu'ecrites dans le fichier (les doublons y restent visibles). */
	private static List<String> rawKeys() throws IOException {
		List<String> keys = new ArrayList<>();
		try (BufferedReader reader = new BufferedReader(new InputStreamReader(
				new ClassPathResource(FILE).getInputStream(), StandardCharsets.UTF_8))) {
			for (String line; (line = reader.readLine()) != null;) {
				String trimmed = line.strip();
				if (!trimmed.isEmpty() && !trimmed.startsWith("#") && !trimmed.startsWith("!") && trimmed.contains("=")) {
					keys.add(trimmed.substring(0, trimmed.indexOf('=')).strip());
				}
			}
		}
		return keys;
	}

	/** Routes par index, avec les valeurs lues par le chargeur de Spring Boot (echappements compris). */
	private static Map<Integer, Map<String, String>> routes() throws IOException {
		PropertySource<?> source = new PropertiesPropertySourceLoader().load(FILE, new ClassPathResource(FILE)).get(0);
		Map<Integer, Map<String, String>> routes = new TreeMap<>();
		for (String key : rawKeys()) {
			Matcher m = ROUTE_KEY.matcher(key);
			if (m.matches()) {
				routes.computeIfAbsent(Integer.valueOf(m.group(1)), i -> new TreeMap<>())
						.put(m.group(2), String.valueOf(source.getProperty(key)));
			}
		}
		return routes;
	}

	private static Map<String, String> route(String id) throws IOException {
		Optional<Map<String, String>> found = routes().values().stream().filter(r -> id.equals(r.get("id"))).findFirst();
		assertThat(found).as("route %s", id).isPresent();
		return found.get();
	}

	private static boolean matches(String pathPredicate, String path) {
		return PathPatternParser.defaultInstance.parse(pathPredicate.substring("Path=".length()))
				.matches(PathContainer.parsePath(path));
	}

	/** Applique le vrai filtre RewritePath du Gateway (« RewritePath=regex, remplacement »). */
	private static String rewrite(String filter, String path) {
		String[] args = filter.substring("RewritePath=".length()).split(",", 2);
		Function<ServerRequest, ServerRequest> rewritePath = BeforeFilterFunctions.rewritePath(args[0].strip(), args[1].strip());
		return rewritePath.apply(ServerRequest.create(new MockHttpServletRequest("GET", path), List.of())).uri().getRawPath();
	}

	@Test
	void noPropertyIsDefinedTwice() throws IOException {
		List<String> keys = rawKeys();
		TreeSet<String> duplicates = keys.stream().filter(k -> keys.indexOf(k) != keys.lastIndexOf(k))
				.collect(Collectors.toCollection(TreeSet::new));
		assertThat(duplicates).as("cles en double (index de route reutilise ?)").isEmpty();
	}

	@Test
	void routeIndexesStartAtZeroWithoutGap() throws IOException {
		// Spring lie routes[0], routes[1]... et refuse de demarrer si un index manque.
		assertThat(routes().keySet()).containsExactlyElementsOf(IntStream.range(0, routes().size()).boxed().toList());
	}

	@Test
	void routeIdsAreUnique() throws IOException {
		List<String> ids = routes().values().stream().map(r -> r.get("id")).toList();
		assertThat(ids).doesNotContainNull().doesNotHaveDuplicates();
	}

	@Test
	void enrollmentRoute() throws IOException {
		Map<String, String> enrollment = route("enrollment-service");
		assertThat(enrollment.get("uri")).isEqualTo("lb://enrollment-service");
		assertThat(enrollment.get("predicates[0]")).isEqualTo("Path=/api/v1/enrollments/**");
	}

	@Test
	void reclamationRouteAndRewrite() throws IOException {
		Map<String, String> reclamation = route("reclamation-service");
		assertThat(reclamation.get("uri")).isEqualTo("lb://reclamation-service");
		String path = reclamation.get("predicates[0]");
		assertThat(path).isEqualTo("Path=/api/v1/reclamation/**");
		assertThat(matches(path, "/api/v1/reclamation/reclamations/")).isTrue();
		assertThat(matches(path, "/api/v1/reclamationX")).isFalse();
		assertThat(matches(path, "/api/v1/enrollments/")).isFalse();

		String filter = reclamation.get("filters[0]");
		assertThat(rewrite(filter, "/api/v1/reclamation/reclamations/")).isEqualTo("/api/reclamations/");
		assertThat(rewrite(filter, "/api/v1/reclamation/reclamations/12/change-status/")).isEqualTo("/api/reclamations/12/change-status/");
		assertThat(rewrite(filter, "/api/v1/reclamation/health")).isEqualTo("/api/health");
		assertThat(rewrite(filter, "/api/v1/reclamation")).isEqualTo("/api");
	}
}
