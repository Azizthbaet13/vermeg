package com.vermeg.pdfgen.repository;

import org.springframework.data.jpa.repository.JpaRepository;

import com.vermeg.pdfgen.entity.Template;

public interface TemplateRepository extends JpaRepository<Template, Long> {
}
