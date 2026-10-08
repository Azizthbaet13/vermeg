package com.vermeg.pdfgen.entity;

import java.time.Instant;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;

@Entity
@Table(name = "templates")
public class Template {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private String name;

    @Column(columnDefinition = "LONGTEXT")
    private String headerHtml;

    @Column(columnDefinition = "LONGTEXT")
    private String bodyHtml;

    @Column(columnDefinition = "LONGTEXT")
    private String footerHtml;

    @Column(columnDefinition = "LONGTEXT")
    private String headerCss;

    @Column(columnDefinition = "LONGTEXT")
    private String bodyCss;

    @Column(columnDefinition = "LONGTEXT")
    private String footerCss;

    @Column(columnDefinition = "LONGTEXT")
    private String tablesSchemaJson;

    @Column(nullable = false, updatable = false)
    private Instant createdAt;

    @Column(nullable = false)
    private Instant updatedAt;

    @PrePersist
    void onCreate() {
        Instant now = Instant.now();
        createdAt = now;
        updatedAt = now;
    }

    @PreUpdate
    void onUpdate() {
        updatedAt = Instant.now();
    }

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

    public String getTablesSchemaJson() {
        return tablesSchemaJson;
    }

    public void setTablesSchemaJson(String tablesSchemaJson) {
        this.tablesSchemaJson = tablesSchemaJson;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }
}
