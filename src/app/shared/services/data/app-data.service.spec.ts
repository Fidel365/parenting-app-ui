import { TestBed } from "@angular/core/testing";

import { HttpClientTestingModule } from "@angular/common/http/testing";

import { AppDataVariableService } from "./app-data-variable.service";
import { AppDataService } from "./app-data.service";
import { FlowTypes } from "../../model";
import { MockAppDataVariableService } from "./app-data-variable.service.spec";
import { ErrorHandlerService } from "../error-handler/error-handler.service";
import { MockErrorHandlerService } from "../error-handler/error-handler.service.spec";
import { DbService } from "../db/db.service";
import { MockDbService } from "../db/db.service.spec";
import { Injectable } from "@angular/core";
import { ISheetContents } from "src/app/data";

const DATA_MOCK: { [flow_name: string]: FlowTypes.FlowTypeWithData } = {
  flow_a: {
    flow_name: "flow_a",
    flow_type: "data_list",
    rows: [
      { id: "a_id1", number: 1, string: "a_hello", boolean: true },
      { id: "a_id2", number: 2, string: "a_goodbye", boolean: false },
    ],
  },
  flow_b: {
    flow_name: "flow_b",
    flow_type: "data_list",
    rows: [
      { id: "b_id1", number: 1, string: "b_hello", boolean: true },
      { id: "b_id2", number: 2, string: "b_goodbye", boolean: false },
    ],
    _overrides: { flow_c: "true" },
  },
  flow_c: {
    flow_name: "flow_c",
    flow_type: "data_list",
    rows: [
      { id: "c_id1", number: 1, string: "c_hello", boolean: true },
      { id: "c_id2", number: 2, string: "c_goodbye", boolean: false },
    ],
    _overrides: { flow_b: "true" },
  },
  flow_d: {
    flow_name: "flow_d",
    flow_type: "data_list",
    rows: [
      { id: "d_id1", number: 1, string: "d_hello", boolean: true },
      { id: "d_id2", number: 2, string: "d_goodbye", boolean: false },
    ],
    _overrides: { flow_a: "true" },
  },
};

const CONTENTS_MOCK: ISheetContents = {
  asset_pack: {},
  data_list: {
    flow_a: {
      flow_name: "flow_a",
      flow_type: "data_list",
    },
    flow_b: {
      flow_name: "flow_b",
      flow_type: "data_list",
      _overrides: { flow_c: "true" },
    },
    flow_c: {
      flow_name: "flow_c",
      flow_type: "data_list",
      _overrides: { flow_b: "true" },
    },
    flow_d: {
      flow_name: "flow_d",
      flow_type: "data_list",
      _overrides: { flow_a: "true" },
    },
  },
  data_pipe: {},
  generator: {},
  global: {},
  template: {},
  tour: {},
};

/** Mock calls for sheets from the appData service to return test data */
export class MockAppDataService implements Partial<AppDataService> {
  public async getSheet<T extends FlowTypes.FlowTypeWithData>(
    flow_type: FlowTypes.FlowType,
    flow_name: string
  ): Promise<T> {
    const rows = DATA_MOCK[flow_name].rows || [];
    return { flow_name, flow_type, rows } as any;
  }
}

/** Use an extended service for testing to allow override of protected variables */
@Injectable({ providedIn: "root" })
class AppDataServiceExtended extends AppDataService {
  protected sheetContents = CONTENTS_MOCK;
  protected translationContents = {};
  public appDataCache = {
    asset_pack: {},
    data_list: { ...DATA_MOCK },
    data_pipe: {},
    generator: {},
    global: {},
    template: {},
    tour: {},
  };
}

/********************************************************************************
 * Tests
 * yarn ng test --include src\app\shared\services\data\app-data.service.spec.ts
 *******************************************************************************/
describe("AppDataService", () => {
  let service: AppDataServiceExtended;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [
        { provide: AppDataVariableService, useValue: new MockAppDataVariableService() },
        { provide: ErrorHandlerService, useValue: new MockErrorHandlerService() },
        { provide: DbService, useValue: new MockDbService() },
        AppDataServiceExtended,
      ],
    });

    service = TestBed.inject(AppDataServiceExtended);
    TestBed.inject(AppDataServiceExtended);
    service.ready();
  });

  it("should be created", () => {
    expect(service).toBeTruthy();
  });

  it("returns data for a flow", async () => {
    const data = await service.getSheet("data_list", "flow_a");
    expect(data.rows?.[0].id).toEqual("a_id1");
  });

  it("handles flow overrides", async () => {
    const data = await service.getSheet("data_list", "flow_d");
    expect(data.rows?.[0].id).toEqual("a_id1");
  });

  // In the case that flow_b is overridden by flow_c, which in turn is overridden by flow_b,
  // the loop should be broken after the initial override
  it("handles recursive flow overrides", async () => {
    const data = await service.getSheet("data_list", "flow_b");
    expect(data.rows?.[0].id).toEqual("c_id1");
  });
  // TODO - add public method tests
});
