import { describe, expect, it } from "vitest";
import { detectAddress } from "./contacts-ui";

const d = (s: string) => detectAddress(s);

describe("連絡先の自動判別", () => {
  it("X の URL は ID だけ取り出す", () => {
    expect(d("https://x.com/hoshino_luna")).toEqual({ key: "x", value: "hoshino_luna", ambiguous: false });
    expect(d("https://twitter.com/hoshino_luna?s=21")).toMatchObject({ key: "x", value: "hoshino_luna" });
    expect(d("x.com/@hoshino_luna/status/123")).toMatchObject({ key: "x", value: "hoshino_luna" });
  });
  it("@ で始まる1語は X と仮定する(Instagram かもしれないので決めかねる印)", () => {
    expect(d("@hoshino_luna")).toEqual({ key: "x", value: "hoshino_luna", ambiguous: true });
  });
  it("Discord の URL は Discord", () => {
    expect(d("https://discord.gg/abc123")).toMatchObject({ key: "discord", ambiguous: false });
    expect(d("discord.com/users/1234")).toMatchObject({ key: "discord", ambiguous: false });
  });
  it("name#1234 は Discord", () => {
    expect(d("tanaka#0421")).toEqual({ key: "discord", value: "tanaka#0421", ambiguous: false });
  });
  it("a@b.c はメール", () => {
    expect(d("luna@example.com")).toEqual({ key: "email", value: "luna@example.com", ambiguous: false });
  });
  it("YouTube の @ 付きURL はメールと間違えず、YouTube と見分ける", () => {
    expect(d("https://youtube.com/@hoshino.luna")).toMatchObject({ key: "youtube", ambiguous: false });
    expect(d("youtube.com/@hoshino.luna")).toMatchObject({ key: "youtube", value: "https://youtube.com/@hoshino.luna" });
  });
  it("Instagram / TikTok の URL は ID だけ取り出す", () => {
    expect(d("https://www.instagram.com/hoshino.luna/?hl=ja")).toEqual({ key: "instagram", value: "hoshino.luna", ambiguous: false });
    expect(d("https://www.tiktok.com/@hoshino_luna?lang=ja")).toEqual({ key: "tiktok", value: "hoshino_luna", ambiguous: false });
  });
  it("Messenger / LINE の URL はその種類", () => {
    expect(d("https://m.me/hoshino.luna")).toMatchObject({ key: "messenger" });
    expect(d("https://www.facebook.com/hoshino.luna")).toMatchObject({ key: "messenger" });
    expect(d("https://line.me/ti/p/abcdef")).toMatchObject({ key: "line" });
  });
  it("http なしのよくあるドメインはページとして https を付ける", () => {
    expect(d("www.example.com")).toMatchObject({ key: "url", value: "https://www.example.com" });
    expect(d("example.jp/about")).toMatchObject({ key: "url", value: "https://example.jp/about" });
  });
  it("ただの1語は X と仮定するが「決めかねる」印を付ける", () => {
    expect(d("hoshino_luna")).toEqual({ key: "x", value: "hoshino_luna", ambiguous: true });
    expect(d("hoshino.luna")).toEqual({ key: "x", value: "hoshino.luna", ambiguous: true });
  });
  it("空白を含むものは Discord のユーザー名と仮定する", () => {
    expect(d("星野 ルナ")).toMatchObject({ key: "discord", ambiguous: true });
  });
  it("空なら null", () => {
    expect(d("   ")).toBeNull();
  });
});
