import { beforeEach,describe,expect,it,vi } from "vitest";

vi.mock("../../src/core/db.js",()=>({ pool:{ query:vi.fn(),connect:vi.fn() } }));

import { AdminRepository } from "../../src/admin/repository.js";
import { pool } from "../../src/core/db.js";

const poolMock=pool as unknown as { query:ReturnType<typeof vi.fn>;connect:ReturnType<typeof vi.fn> };

describe("listening set administration",()=>{
  beforeEach(()=>{poolMock.query.mockReset();poolMock.connect.mockReset();});

  it("detects unlinked SQL sets and sorts registered rounds first",async()=>{
    poolMock.query.mockResolvedValue({rows:[
      {setId:"set-new",setSequence:2,createdAt:new Date("2026-08-12"),reviewStatus:"reviewed",publishedAt:new Date(),itemCount:50,validItemCount:50,audioReady:0,visualRequired:12,visualReady:0,mockTestId:null,slug:null,titleKo:null,mockTestPublished:null},
      {setId:"set-one",setSequence:1,createdAt:new Date("2026-08-10"),reviewStatus:"reviewed",publishedAt:new Date(),itemCount:50,validItemCount:50,audioReady:50,visualRequired:12,visualReady:12,mockTestId:"mock-one",slug:"topik-ii-listening-1",titleKo:"듣기 1회",mockTestPublished:true},
    ]});
    const result=await new AdminRepository().listListeningSets();
    expect(result.map((set)=>set.setId)).toEqual(["set-one","set-new"]);
    expect(result[0]).toMatchObject({round:1,readyToPublish:true});
    expect(result[1]).toMatchObject({round:null,readyToRegister:true,blockingReasons:[]});
  });

  it("registers the next listening round as a draft",async()=>{
    const query=vi.fn(async(sql:string)=>{
      if(sql.includes("FROM topik_app.mock_test_sections"))return {rows:[]};
      if(sql.includes("FROM topik_bank.question_sets"))return {rows:[{section:"listening",review_status:"reviewed",published_at:new Date(),item_count:50,valid_item_count:50}]};
      if(sql.includes("substring(slug"))return {rows:[{round:3,display_order:5}]};
      return {rows:[],rowCount:1};
    });
    poolMock.connect.mockResolvedValue({query,release:vi.fn()});
    const result=await new AdminRepository().registerListeningSet("10000000-0000-4000-8000-000000000020");
    expect(result).toMatchObject({slug:"topik-ii-listening-3",round:3,published:false,created:true});
    const insert=String(query.mock.calls.find(([sql])=>String(sql).includes("INSERT INTO topik_app.mock_tests"))?.[0]);
    expect(insert).toContain("FALSE");
    expect(query).toHaveBeenCalledWith("COMMIT");
  });

  it("does not duplicate an already registered set",async()=>{
    const query=vi.fn(async(sql:string)=>sql.includes("FROM topik_app.mock_test_sections")
      ?{rows:[{mock_test_id:"mock-three",slug:"topik-ii-listening-3",is_published:false}]}
      :{rows:[],rowCount:1});
    poolMock.connect.mockResolvedValue({query,release:vi.fn()});
    await expect(new AdminRepository().registerListeningSet("10000000-0000-4000-8000-000000000020")).resolves.toEqual({mockTestId:"mock-three",slug:"topik-ii-listening-3",round:3,published:false,created:false});
    expect(query.mock.calls.some(([sql])=>String(sql).includes("INSERT INTO"))).toBe(false);
  });

  it("deletes the Supabase object before removing visual metadata",async()=>{
    const operations:string[]=[];
    const query=vi.fn(async(sql:string)=>{
      if(sql.includes("SELECT storage_bucket"))return {rows:[{storage_bucket:"media",storage_path:"listening/item.png"}]};
      if(sql.includes("DELETE FROM topik_app.item_visual_assets"))operations.push("database-delete");
      return {rows:[],rowCount:1};
    });
    poolMock.connect.mockResolvedValue({query,release:vi.fn()});
    const removeObject=vi.fn(async()=>{operations.push("storage-delete");});
    await expect(new AdminRepository().deleteVisualAsset("10000000-0000-4000-8000-000000000011",1,2,"20000000-0000-4000-8000-000000000011","choice",removeObject)).resolves.toEqual({deleted:true,storageDeleted:true});
    expect(removeObject).toHaveBeenCalledWith("media","listening/item.png");
    expect(operations).toEqual(["storage-delete","database-delete"]);
  });

  it("keeps visual metadata when Supabase deletion fails",async()=>{
    const query=vi.fn(async(sql:string)=>sql.includes("SELECT storage_bucket")
      ?{rows:[{storage_bucket:"media",storage_path:"listening/item.png"}]}
      :{rows:[],rowCount:1});
    poolMock.connect.mockResolvedValue({query,release:vi.fn()});
    await expect(new AdminRepository().deleteVisualAsset("10000000-0000-4000-8000-000000000011",1,2,"20000000-0000-4000-8000-000000000011","choice",vi.fn().mockRejectedValue(new Error("storage failed")))).rejects.toThrow("storage failed");
    expect(query.mock.calls.some(([sql])=>String(sql).includes("DELETE FROM topik_app.item_visual_assets"))).toBe(false);
    expect(query).toHaveBeenCalledWith("ROLLBACK");
  });

  it("queues replaced visual storage for durable cleanup in the binding transaction",async()=>{
    const query=vi.fn(async(sql:string,_params?:unknown[])=>{
      if(sql.includes("FROM topik_bank.question_set_items"))return {rows:[{}],rowCount:1};
      if(sql.includes("UPDATE topik_app.item_visual_assets SET is_current=FALSE"))return {rows:[{
        visual_asset_id:"20000000-0000-4000-8000-000000000099",
        storage_bucket:"media",storage_path:"listening/old.png",
      }],rowCount:1};
      return {rows:[],rowCount:1};
    });
    poolMock.connect.mockResolvedValue({query,release:vi.fn()});

    await new AdminRepository().bindVisualAsset({
      adminUserId:"admin-1",itemId:"10000000-0000-4000-8000-000000000011",itemVersion:1,
      optionNumber:2,visualRole:"choice",bucket:"media",path:"listening/new.png",
      url:"https://example.com/new.png",mimeType:"image/png",byteSize:100,
    });

    const cleanupInsert=query.mock.calls.find(([sql])=>String(sql).includes("INSERT INTO topik_app.media_cleanup_jobs"));
    expect(cleanupInsert?.[1]).toEqual([
      expect.any(String),"visual","20000000-0000-4000-8000-000000000099","media","listening/old.png",
    ]);
    expect(query).toHaveBeenCalledWith("COMMIT");
  });

  it("rejects image writes and deletes for a historical item version",async()=>{
    const query=vi.fn(async(sql:string)=>{
      if(sql.includes("FROM topik_bank.question_set_items"))return {rows:[],rowCount:0};
      return {rows:[],rowCount:0};
    });
    poolMock.connect.mockResolvedValue({query,release:vi.fn()});

    await expect(new AdminRepository().enqueueVisualOption("admin-1","item-1",1,1,false))
      .rejects.toMatchObject({statusCode:404});
    expect(query.mock.calls.some(([sql])=>String(sql).includes("INSERT INTO topik_app.visual_generation_jobs"))).toBe(false);

    await expect(new AdminRepository().deleteVisualAsset("item-1",1,1,"asset-1","choice",vi.fn()))
      .rejects.toMatchObject({statusCode:404});
    expect(query.mock.calls.some(([sql])=>String(sql).includes("DELETE FROM topik_app.item_visual_assets"))).toBe(false);
  });
});
