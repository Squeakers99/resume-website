import { describe, expect, it } from "vitest";
import { CsvParseError, looksLikeCsv, parseBmoCsv } from "./csv";

const SAMPLE = `Following data is valid as of 20260709114529 (Year/Month/Day/Hour/Minute/Second)


First Bank Card,Transaction Type,Date Posted, Transaction Amount,Description

'5510290119795713',CREDIT,20260417,12.5,[CW]INTERAC ETRNSFR AD RECVD DANEL MIRONOV            20261070155ZED8ZN
'5510290119795713',DEBIT,20260422,-22.0,[CW]INTERAC ETRNSFR SENT     LIAM                     20261121852C410F3

First Bank Card,Transaction Type,Date Posted, Transaction Amount,Description

'5510290119795713',CREDIT,20260410,665.55,[DN]U OF A          PAY/PAY
'5510290119795713',CREDIT,20260430,0.11,[IN]
`;

describe("looksLikeCsv", () => {
  it("matches by extension or mimetype", () => {
    expect(looksLikeCsv("statement (1).csv", "application/octet-stream")).toBe(true);
    expect(looksLikeCsv("statement.pdf", "text/csv")).toBe(true);
    expect(looksLikeCsv("statement.pdf", "application/pdf")).toBe(false);
  });
});

describe("parseBmoCsv", () => {
  it("splits header-delimited blocks and normalizes rows", () => {
    const blocks = parseBmoCsv(SAMPLE);
    expect(blocks).toHaveLength(2);
    expect(blocks[0].card).toBe("5510290119795713");
    expect(blocks[0].rows).toEqual([
      {
        date: "2026-04-17",
        amount: 12.5,
        isCredit: true,
        description: "INTERAC ETRNSFR AD RECVD DANEL MIRONOV 20261070155ZED8ZN",
      },
      {
        date: "2026-04-22",
        amount: 22.0,
        isCredit: false,
        description: "INTERAC ETRNSFR SENT LIAM 20261121852C410F3",
      },
    ]);
    expect(blocks[1].rows[0].description).toBe("U OF A PAY/PAY");
    expect(blocks[1].rows[1].description).toBe("(no description)");
  });

  it("uses absolute amounts with the credit flag carrying direction", () => {
    const blocks = parseBmoCsv(SAMPLE);
    expect(blocks[0].rows[1].amount).toBe(22.0);
    expect(blocks[0].rows[1].isCredit).toBe(false);
  });

  it("throws on unparseable dates", () => {
    expect(() =>
      parseBmoCsv("'123',CREDIT,26-04-17,5.0,desc")
    ).toThrow(CsvParseError);
  });

  it("throws when no transactions exist", () => {
    expect(() => parseBmoCsv("just a preamble line")).toThrow(CsvParseError);
  });
});
