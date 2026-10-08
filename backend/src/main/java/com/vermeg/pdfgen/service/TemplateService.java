package com.vermeg.pdfgen.service;

import java.util.List;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.vermeg.pdfgen.dto.TemplateRequestDTO;
import com.vermeg.pdfgen.dto.TemplateResponseDTO;
import com.vermeg.pdfgen.entity.Template;
import com.vermeg.pdfgen.exception.TemplateNotFoundException;
import com.vermeg.pdfgen.model.TableSchema;
import com.vermeg.pdfgen.repository.TemplateRepository;

@Service
public class TemplateService {

    private final TemplateRepository templateRepository;
    private final TableRenderingService tableRenderingService;

    public TemplateService(
            TemplateRepository templateRepository, TableRenderingService tableRenderingService) {
        this.templateRepository = templateRepository;
        this.tableRenderingService = tableRenderingService;
    }

    @Transactional
    public TemplateResponseDTO create(TemplateRequestDTO request) {
        Template template = new Template();
        apply(template, request);
        return toResponse(templateRepository.save(template));
    }

    @Transactional(readOnly = true)
    public TemplateResponseDTO getById(Long id) {
        return toResponse(findOrThrow(id));
    }

    @Transactional(readOnly = true)
    public Page<TemplateResponseDTO> list(Pageable pageable) {
        return templateRepository.findAll(pageable).map(this::toResponse);
    }

    @Transactional
    public TemplateResponseDTO update(Long id, TemplateRequestDTO request) {
        Template template = findOrThrow(id);
        apply(template, request);
        return toResponse(templateRepository.save(template));
    }

    @Transactional
    public void delete(Long id) {
        if (!templateRepository.existsById(id)) {
            throw new TemplateNotFoundException(id);
        }
        templateRepository.deleteById(id);
    }

    @Transactional(readOnly = true)
    public Template findOrThrow(Long id) {
        return templateRepository.findById(id).orElseThrow(() -> new TemplateNotFoundException(id));
    }

    private void apply(Template template, TemplateRequestDTO request) {
        template.setName(request.getName());
        template.setHeaderHtml(nullToEmpty(request.getHeaderHtml()));
        template.setBodyHtml(nullToEmpty(request.getBodyHtml()));
        template.setFooterHtml(nullToEmpty(request.getFooterHtml()));
        template.setHeaderCss(nullToEmpty(request.getHeaderCss()));
        template.setBodyCss(nullToEmpty(request.getBodyCss()));
        template.setFooterCss(nullToEmpty(request.getFooterCss()));
        template.setTablesSchemaJson(tableRenderingService.serializeSchemas(request.getTables()));
    }

    private TemplateResponseDTO toResponse(Template template) {
        TemplateResponseDTO dto = new TemplateResponseDTO();
        dto.setId(template.getId());
        dto.setName(template.getName());
        dto.setHeaderHtml(template.getHeaderHtml());
        dto.setBodyHtml(template.getBodyHtml());
        dto.setFooterHtml(template.getFooterHtml());
        dto.setHeaderCss(template.getHeaderCss());
        dto.setBodyCss(template.getBodyCss());
        dto.setFooterCss(template.getFooterCss());
        List<TableSchema> tables = tableRenderingService.parseSchemas(template.getTablesSchemaJson());
        dto.setTables(tables);
        dto.setCreatedAt(template.getCreatedAt());
        dto.setUpdatedAt(template.getUpdatedAt());
        return dto;
    }

    private static String nullToEmpty(String value) {
        return value == null ? "" : value;
    }
}
