package com.vermeg.pdfgen.service;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class VariablePreprocessorServiceTest {

    private VariablePreprocessorService service;

    @BeforeEach
    void setUp() {
        service = new VariablePreprocessorService();
    }

    @Test
    void convertsScalarPlaceholdersToThymeleaf() {
        String html = "<p>{{clientName}} — {{packageOffer.status}}</p>";

        String result = service.preprocess(html);

        assertThat(result).isEqualTo("<p>[[${clientName}]] — [[${packageOffer.status}]]</p>");
    }

    @Test
    void ignoresTablePlaceholders() {
        String html = "{{table:articles}} et {{invoiceNumber}}";

        String result = service.preprocess(html);

        assertThat(result).contains("{{table:articles}}");
        assertThat(result).contains("[[${invoiceNumber}]]");
        assertThat(result).doesNotContain("[[${table:articles}]]");
    }

    @Test
    void handlesWhitespaceInsideBraces() {
        String result = service.preprocess("{{  date  }}");

        assertThat(result).isEqualTo("[[${date}]]");
    }
}
