package com.vermeg.pdfgen.controller;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.data.web.PageableDefault;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import com.vermeg.pdfgen.dto.TemplateRequestDTO;
import com.vermeg.pdfgen.dto.TemplateResponseDTO;
import com.vermeg.pdfgen.service.TemplateService;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;

@RestController
@RequestMapping("/api/templates")
@Tag(name = "Templates", description = "CRUD des templates HTML / CSS / tableaux")
public class TemplateController {

    private final TemplateService templateService;

    public TemplateController(TemplateService templateService) {
        this.templateService = templateService;
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    @Operation(summary = "Créer un template")
    public TemplateResponseDTO create(@Valid @RequestBody TemplateRequestDTO request) {
        return templateService.create(request);
    }

    @GetMapping("/{id}")
    @Operation(summary = "Lire un template par id")
    public TemplateResponseDTO getById(@PathVariable Long id) {
        return templateService.getById(id);
    }

    @GetMapping
    @Operation(summary = "Lister les templates (pagination)")
    public Page<TemplateResponseDTO> list(
            @PageableDefault(size = 20, sort = "updatedAt", direction = Sort.Direction.DESC)
                    Pageable pageable) {
        Pageable safe = sanitize(pageable);
        return templateService.list(safe);
    }

    /** Ignore un sort Swagger invalide (ex. propriété \"string\"). */
    private static Pageable sanitize(Pageable pageable) {
        Sort sort = pageable.getSort();
        if (sort.isUnsorted()) {
            return PageRequest.of(
                    pageable.getPageNumber(),
                    pageable.getPageSize(),
                    Sort.by(Sort.Direction.DESC, "updatedAt"));
        }
        boolean valid = true;
        for (Sort.Order order : sort) {
            String prop = order.getProperty();
            if (prop == null
                    || prop.isBlank()
                    || prop.contains("[")
                    || "string".equalsIgnoreCase(prop)
                    || !prop.matches("[a-zA-Z][a-zA-Z0-9_]*")) {
                valid = false;
                break;
            }
        }
        if (valid) {
            return pageable;
        }
        return PageRequest.of(
                pageable.getPageNumber(),
                pageable.getPageSize(),
                Sort.by(Sort.Direction.DESC, "updatedAt"));
    }

    @PutMapping("/{id}")
    @Operation(summary = "Mettre à jour un template")
    public TemplateResponseDTO update(
            @PathVariable Long id, @Valid @RequestBody TemplateRequestDTO request) {
        return templateService.update(id, request);
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @Operation(summary = "Supprimer un template")
    public void delete(@PathVariable Long id) {
        templateService.delete(id);
    }
}
