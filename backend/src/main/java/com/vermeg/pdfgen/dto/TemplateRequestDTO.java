package com.vermeg.pdfgen.dto;

import java.util.ArrayList;
import java.util.List;

import com.vermeg.pdfgen.model.TableSchema;

import jakarta.validation.constraints.NotBlank;

public class TemplateRequestDTO {

    @NotBlank(message = "Le nom du template est obligatoire")
    private String name;
    private String headerHtml;
    private String bodyHtml;
    private String footerHtml;
    private String headerCss;
    private String bodyCss;
    private String footerCss;
    private List<TableSchema> tables = new ArrayList<>();

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
}
