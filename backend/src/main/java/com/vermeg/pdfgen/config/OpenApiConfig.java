package com.vermeg.pdfgen.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import io.swagger.v3.oas.models.OpenAPI;
import io.swagger.v3.oas.models.info.Info;

@Configuration
public class OpenApiConfig {

    @Bean
    public OpenAPI pdfGenOpenAPI() {
        return new OpenAPI()
                .info(new Info()
                        .title("Vermeg PDF Gen")
                        .version("1.0.0")
                        .description(
                                "API templates, génération PDF (Playwright) et commit Git. "
                                        + "UI : /swagger-ui.html"));
    }
}
