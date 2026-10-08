package com.vermeg.pdfgen.dto;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

import com.vermeg.pdfgen.model.TableSchema;

public class TemplateResponseDTO {

    private Long id;
    private String name;
    private String headerHtml;
    private String bodyHtml;
    private String footerHtml;
    private String headerCss;
    private String bodyCss;
    private String footerCss;
    private List<TableSchema> tables = new ArrayList<>();
    private Instant createdAt;
    private Instant updatedAt;

    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
    }

    public String getHeaderHtml() {
        return headerHtml;
    }

    public void setHeaderHtml(String headerHtml) {
        this.headerHtml = headerHtml;
    }

    public String getBodyHtml() {
        return bodyHtml;
    }

    public void setBodyHtml(String bodyHtml) {
        this.bodyHtml = bodyHtml;
    }

    public String getFooterHtml() {
        return footerHtml;
    }

    public void setFooterHtml(String footerHtml) {
        this.footerHtml = footerHtml;
    }

    public String getHeaderCss() {
        return headerCss;
    }

    public void setHeaderCss(String headerCss) {
        this.headerCss = headerCss;
    }

    public String getBodyCss() {
        return bodyCss;
    }

    public void setBodyCss(String bodyCss) {
        this.bodyCss = bodyCss;
    }

    public String getFooterCss() {
        return footerCss;
    }

    public void setFooterCss(String footerCss) {
        this.footerCss = footerCss;
    }

    public List<TableSchema> getTables() {
        return tables;
    }

    public void setTables(List<TableSchema> tables) {
        this.tables = tables != null ? tables : new ArrayList<>();
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(Instant createdAt) {
        this.createdAt = createdAt;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }

    public void setUpdatedAt(Instant updatedAt) {
        this.updatedAt = updatedAt;
    }
}
