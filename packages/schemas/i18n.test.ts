import { afterEach, describe, expect, it } from "vitest"
import {
  AccountSchema,
  CreateProviderSchema,
  EventFormSchema,
  FlowSchema,
  JsonSchemaEditorSchema,
  LoginSchema,
  SendThreadTurnSchema,
  TransactionSchema,
  TransferSchema,
  configureZodLocale,
  getActiveZodLocale,
  schemaMessage,
} from "./index"

describe("@saturn/schemas/i18n", () => {
  afterEach(() => {
    configureZodLocale("en-US")
  })

  it("tracks and normalizes active Zod locale", () => {
    expect(getActiveZodLocale()).toBe("en-US")
    configureZodLocale("es-ES")
    expect(getActiveZodLocale()).toBe("es-ES")
    configureZodLocale("es-419")
    expect(getActiveZodLocale()).toBe("es-419")
    configureZodLocale("invalid_tag$$")
    expect(getActiveZodLocale()).toBe("en-US")
  })

  it("localizes built-in Zod v4 enum and type errors dynamically after schema construction", () => {
    configureZodLocale("en-US")
    const enResult = AccountSchema.safeParse({
      name: "Checking",
      type: "INVALID_TYPE",
      currency: "USD",
      initialBalance: "100",
      color: "#000000",
      isDefault: false,
      isActive: true,
    })
    expect(enResult.success).toBe(false)
    const enTypeIssue = !enResult.success
      ? enResult.error.issues.find((i) => i.path.includes("type"))
      : undefined
    expect(enTypeIssue?.message).toContain("Invalid option")

    configureZodLocale("es-ES")
    const esResult = AccountSchema.safeParse({
      name: "Checking",
      type: "INVALID_TYPE",
      currency: "USD",
      initialBalance: "100",
      color: "#000000",
      isDefault: false,
      isActive: true,
    })
    expect(esResult.success).toBe(false)
    const esTypeIssue = !esResult.success
      ? esResult.error.issues.find((i) => i.path.includes("type"))
      : undefined
    expect(esTypeIssue?.message).toContain("Opción inválida")
  })

  it.each([
    {
      name: "LoginSchema missing credentials",
      run: () => LoginSchema.safeParse({ identifier: "", password: "" }),
      expectedEn: ["Username or email is required", "Password is required"],
      expectedEs: [
        "El usuario o correo electrónico es obligatorio",
        "La contraseña es obligatoria",
      ],
    },
    {
      name: "TransactionSchema missing description, zero amount, missing budget",
      run: () =>
        TransactionSchema.safeParse({
          description: "",
          amount: "0",
          currency: "",
          transactionDate: new Date(),
          hasCustomEffectiveDate: false,
          effectiveDate: new Date(),
          budgetId: "",
        }),
      expectedEn: [
        "Description is required",
        "Amount must be greater than zero",
        "Currency is required",
        "Budget is required",
      ],
      expectedEs: [
        "La descripción es obligatoria",
        "El monto debe ser mayor que cero",
        "La moneda es obligatoria",
        "El presupuesto es obligatorio",
      ],
    },
    {
      name: "TransferSchema same source and destination account",
      run: () =>
        TransferSchema.safeParse({
          sourceAccountId: "acc_1",
          destinationAccountId: "acc_1",
          sourceAmount: "10",
          destinationAmount: "10",
          transferDate: new Date(),
        }),
      expectedEn: ["Source and destination accounts must be different"],
      expectedEs: ["Las cuentas de origen y destino deben ser diferentes"],
    },
    {
      name: "AccountSchema invalid lastFour and negative creditLimit",
      run: () =>
        AccountSchema.safeParse({
          name: "",
          lastFour: "12345",
          type: "CREDIT_CARD",
          currency: "USD",
          initialBalance: "abc",
          creditLimit: "-50",
          color: "#ffffff",
          isDefault: false,
          isActive: true,
        }),
      expectedEn: [
        "Account name is required",
        "Max 4 digits",
        "Initial balance must be a valid number",
        "Credit limit must be a valid non-negative number",
      ],
      expectedEs: [
        "El nombre de la cuenta es obligatorio",
        "Máximo 4 dígitos",
        "El saldo inicial debe ser un número válido",
        "El límite de crédito debe ser un número válido no negativo",
      ],
    },
    {
      name: "EventFormSchema end time before start time",
      run: () =>
        EventFormSchema.safeParse({
          calendarId: "cal_1",
          title: "Meeting",
          isAllDay: false,
          startTime: "2026-10-20T12:00:00Z",
          endTime: "2026-10-20T10:00:00Z",
        }),
      expectedEn: ["End time cannot be earlier than start time"],
      expectedEs: ["La hora de fin no puede ser anterior a la hora de inicio"],
    },
    {
      name: "FlowSchema duplicate step ID",
      run: () =>
        FlowSchema.safeParse({
          name: "Flow",
          steps: [
            { id: "step_1", type: "transform" },
            { id: "step_1", type: "transform" },
          ],
        }),
      expectedEn: ['Duplicate step ID "step_1"'],
      expectedEs: ['ID de paso duplicado "step_1"'],
    },
  ])(
    "localizes $name across en-US and es-419",
    ({ run, expectedEn, expectedEs }) => {
      configureZodLocale("en-US")
      const enRes = run()
      expect(enRes.success).toBe(false)
      if (!enRes.success) {
        const msgs = enRes.error.issues.map((i) => i.message)
        for (const expected of expectedEn) {
          expect(msgs).toContain(expected)
        }
      }

      configureZodLocale("es-419")
      const esRes = run()
      expect(esRes.success).toBe(false)
      if (!esRes.success) {
        const msgs = esRes.error.issues.map((i) => i.message)
        for (const expected of expectedEs) {
          expect(msgs).toContain(expected)
        }
      }
    }
  )

  it("translates dynamic superRefine and parameterized schema messages in English and Spanish", () => {
    configureZodLocale("en-US")
    const enProvider = CreateProviderSchema.safeParse({
      name: "Gemini",
      driver: "gemini",
    })
    expect(enProvider.success).toBe(false)
    if (!enProvider.success) {
      expect(enProvider.error.issues.map((i) => i.message)).toContain(
        "API key is required for gemini"
      )
    }

    configureZodLocale("es-ES")
    const esProvider = CreateProviderSchema.safeParse({
      name: "Gemini",
      driver: "gemini",
    })
    expect(esProvider.success).toBe(false)
    if (!esProvider.success) {
      expect(esProvider.error.issues.map((i) => i.message)).toContain(
        "La clave API es obligatoria para gemini"
      )
    }

    const dupFieldRes = JsonSchemaEditorSchema.safeParse({
      fields: [
        { name: "email", type: "string", required: true },
        { name: "email", type: "string", required: false },
      ],
    })
    expect(dupFieldRes.success).toBe(false)
    if (!dupFieldRes.success) {
      expect(dupFieldRes.error.issues.map((i) => i.message)).toContain(
        'Campo duplicado "email"'
      )
    }

    const tooManyAttachments = SendThreadTurnSchema.safeParse({
      content: "hi",
      attachments: Array.from({ length: 6 }, (_, idx) => ({
        filename: `file-${idx}.pdf`,
        contentType: "application/pdf" as const,
        sizeBytes: 100,
      })),
    })
    expect(tooManyAttachments.success).toBe(false)
    if (!tooManyAttachments.success) {
      expect(tooManyAttachments.error.issues.map((i) => i.message)).toContain(
        "Se permiten como máximo 5 archivos adjuntos por mensaje"
      )
    }

    expect(
      schemaMessage("workflow.duplicateSwitchCase", { name: "vip" }, "es-ES")
    ).toBe('Nombre de caso switch duplicado "vip"')
    expect(
      schemaMessage("workflow.duplicateField", { name: "email" }, "es-ES")
    ).toBe('Campo duplicado "email"')
    expect(schemaMessage("ai.maxAttachments", { max: 5 }, "es-ES")).toBe(
      "Se permiten como máximo 5 archivos adjuntos por mensaje"
    )
  })
})
