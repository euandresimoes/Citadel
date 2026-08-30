import type { NetworkEndpoint, NetworkProvider } from "./provider.js";
import makeMdns from "multicast-dns";

interface MdnsRecord { name: string; type: string; data: unknown; }

export function parseLanMdnsRecords(records: MdnsRecord[]): NetworkEndpoint[] {
  const serviceNames = records.filter((record) => record.type === "PTR").map((record) => String(record.data));
  const services = new Map(records.filter((record) => record.type === "SRV").map((record) => [record.name, record.data as { target: string; port: number }]));
  const addresses = new Map(records.filter((record) => record.type === "A").map((record) => [record.name, String(record.data)]));
  return serviceNames.flatMap((name) => {
    const service = services.get(name);
    if (!service) return [];
    const host = addresses.get(service.target) ?? service.target.replace(/\.$/, "");
    return [{ url: `ws://${host}:${service.port}`, mode: "lan" as const }];
  });
}

export class LanProvider implements NetworkProvider {
  public readonly mode = "lan" as const;

  public constructor(private readonly endpoint?: string, private readonly discoveryTimeoutMs = 500) {}

  public async discover(): Promise<NetworkEndpoint[]> {
    if (this.endpoint) return [{ url: this.endpoint, mode: this.mode }];
    const mdns = makeMdns();
    return new Promise((resolve) => {
      const records: MdnsRecord[] = [];
      const timer = setTimeout(() => { mdns.destroy(); resolve(parseLanMdnsRecords(records)); }, this.discoveryTimeoutMs);
      mdns.on("response", (response) => {
        const responseRecords = [
          ...(response.answers ?? []),
          ...(response.additionals ?? []),
        ] as Array<{ name: string; type: string; data: unknown }>;
        records.push(...responseRecords.map((record) => ({
          name: record.name,
          type: record.type,
          data: record.data,
        })));
      });
      mdns.query({ questions: [{ name: "_citadel._tcp.local", type: "PTR" }] });
      timer.unref();
    });
  }

  public async isAvailable(): Promise<boolean> {
    return (await this.discover()).length > 0;
  }
}
