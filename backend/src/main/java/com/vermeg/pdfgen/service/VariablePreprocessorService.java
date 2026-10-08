package com.vermeg.pdfgen.service;

import java.util.regex.Matcher;
import java.util.regex.Pattern;

import org.springframework.stereotype.Service;

/**
 * Convertit les variables scalaires {@code {{nom.propriete}}} en syntaxe
 * Thymeleaf {@code [[${nom.propriete}]]}. Les placeholders {@code {{table:...}}}
 * sont ignorés (ils doivent déjà avoir été consommés).
 */
@Service
public class VariablePreprocessorService {

    private static final Pattern SCALAR_PLACEHOLDER =
            Pattern.compile("\\{\\{\\s*(?!table:)([a-zA-Z_][\\w.]*)\\s*\\}\\}");

    public String preprocess(String html) {
        if (html == null || html.isBlank()) {
            return html == null ? "" : html;
        }
        Matcher matcher = SCALAR_PLACEHOLDER.matcher(html);
        StringBuffer result = new StringBuffer();
        while (matcher.find()) {
            String expression = matcher.group(1);
            matcher.appendReplacement(result, Matcher.quoteReplacement("[[${" + expression + "}]]"));
        }
        matcher.appendTail(result);
        return result.toString();
    }
}
