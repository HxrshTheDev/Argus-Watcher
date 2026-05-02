import { useState } from "react";
import { 
  useListWorkflows, 
  useCreateWorkflow, 
  useUpdateWorkflow, 
  useDeleteWorkflow,
  useRunWorkflow,
  getListWorkflowsQueryKey
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Zap, Plus, Play, Trash2, Edit2, AlertCircle, CheckCircle2, Clock } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

export default function Workflows() {
  const queryClient = useQueryClient();
  const { data: workflows, isLoading } = useListWorkflows();
  
  const createMutation = useCreateWorkflow();
  const updateMutation = useUpdateWorkflow();
  const deleteMutation = useDeleteWorkflow();
  const runMutation = useRunWorkflow();

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isRunResultOpen, setIsRunResultOpen] = useState(false);
  const [runResult, setRunResult] = useState<any>(null);

  // Create Form State
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [trigger, setTrigger] = useState("manual");
  const [steps, setSteps] = useState('[\n  {\n    "action": "summarize_emails",\n    "params": {}\n  }\n]');

  const handleCreate = () => {
    if (!name.trim()) return;

    createMutation.mutate(
      {
        data: {
          name,
          description,
          trigger,
          steps
        }
      },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListWorkflowsQueryKey() });
          setIsCreateOpen(false);
          // Reset form
          setName("");
          setDescription("");
          setTrigger("manual");
          setSteps('[\n  {\n    "action": "summarize_emails",\n    "params": {}\n  }\n]');
        }
      }
    );
  };

  const handleToggle = (id: number, currentEnabled: boolean) => {
    updateMutation.mutate(
      { id, data: { enabled: !currentEnabled } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListWorkflowsQueryKey() });
        }
      }
    );
  };

  const handleDelete = (id: number) => {
    deleteMutation.mutate(
      { id },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListWorkflowsQueryKey() });
        }
      }
    );
  };

  const handleRun = (id: number) => {
    runMutation.mutate(
      { id },
      {
        onSuccess: (result) => {
          setRunResult(result);
          setIsRunResultOpen(true);
          queryClient.invalidateQueries({ queryKey: getListWorkflowsQueryKey() });
        }
      }
    );
  };

  return (
    <div className="flex h-full w-full overflow-hidden bg-background">
      <div className="flex-1 flex flex-col p-8 max-w-6xl mx-auto w-full overflow-hidden">
        <div className="mb-6 flex justify-between items-end">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Automations</h1>
            <p className="text-muted-foreground mt-1">Configure workflows to automate your routines.</p>
          </div>
          
          <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2">
                <Plus className="w-4 h-4" /> New Workflow
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[600px]">
              <DialogHeader>
                <DialogTitle>Create Workflow</DialogTitle>
                <DialogDescription>
                  Define a new automation sequence using JSON steps.
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid gap-2">
                  <Label htmlFor="name">Name</Label>
                  <Input 
                    id="name" 
                    value={name} 
                    onChange={(e) => setName(e.target.value)} 
                    placeholder="e.g. Morning Briefing" 
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="description">Description</Label>
                  <Input 
                    id="description" 
                    value={description} 
                    onChange={(e) => setDescription(e.target.value)} 
                    placeholder="What does this workflow do?" 
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="trigger">Trigger</Label>
                  <Input 
                    id="trigger" 
                    value={trigger} 
                    onChange={(e) => setTrigger(e.target.value)} 
                    placeholder="e.g. manual, schedule:0 9 * * *" 
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="steps">Steps (JSON)</Label>
                  <Textarea 
                    id="steps" 
                    value={steps} 
                    onChange={(e) => setSteps(e.target.value)} 
                    className="font-mono text-sm min-h-[150px]"
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsCreateOpen(false)}>Cancel</Button>
                <Button onClick={handleCreate} disabled={!name.trim() || createMutation.isPending}>
                  Save Workflow
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        <Card className="flex-1 overflow-hidden flex flex-col border-border">
          <ScrollArea className="flex-1 bg-card/50">
            {isLoading ? (
              <div className="p-12 text-center text-muted-foreground">Loading workflows...</div>
            ) : workflows?.length ? (
              <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
                {workflows.map((workflow) => (
                  <Card key={workflow.id} className="flex flex-col border border-border/50 shadow-sm overflow-hidden hover:border-primary/30 transition-colors">
                    <CardHeader className="bg-muted/30 border-b border-border/50 pb-4">
                      <div className="flex justify-between items-start">
                        <div className="flex items-center gap-3">
                          <div className={`p-2 rounded-md ${workflow.enabled ? 'bg-primary/20 text-primary' : 'bg-muted text-muted-foreground'}`}>
                            <Zap className="w-5 h-5" />
                          </div>
                          <div>
                            <CardTitle className="text-lg">{workflow.name}</CardTitle>
                            <CardDescription className="line-clamp-1 mt-0.5">{workflow.description}</CardDescription>
                          </div>
                        </div>
                        <Switch 
                          checked={workflow.enabled} 
                          onCheckedChange={() => handleToggle(workflow.id, workflow.enabled)} 
                        />
                      </div>
                    </CardHeader>
                    <CardContent className="flex-1 p-5 pt-4">
                      <div className="grid grid-cols-2 gap-4 mb-4 text-sm">
                        <div>
                          <p className="text-muted-foreground text-xs uppercase tracking-wider font-semibold mb-1">Trigger</p>
                          <p className="font-medium bg-muted px-2 py-1 rounded inline-block text-xs">{workflow.trigger}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground text-xs uppercase tracking-wider font-semibold mb-1">Last Run</p>
                          <div className="flex items-center gap-1.5 text-xs font-medium">
                            {workflow.lastRunStatus === 'success' ? (
                              <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
                            ) : workflow.lastRunStatus === 'error' ? (
                              <AlertCircle className="w-3.5 h-3.5 text-destructive" />
                            ) : (
                              <Clock className="w-3.5 h-3.5 text-muted-foreground" />
                            )}
                            {workflow.lastRunAt ? formatDistanceToNow(new Date(workflow.lastRunAt), { addSuffix: true }) : 'Never'}
                          </div>
                        </div>
                      </div>
                      
                      <div className="mt-4 pt-4 border-t border-border flex gap-2">
                        <Button 
                          variant="default" 
                          size="sm" 
                          className="flex-1 gap-2"
                          onClick={() => handleRun(workflow.id)}
                          disabled={runMutation.isPending || !workflow.enabled}
                        >
                          <Play className="w-3.5 h-3.5" /> Run Now
                        </Button>
                        <Button variant="outline" size="icon" className="h-9 w-9">
                          <Edit2 className="w-4 h-4" />
                        </Button>
                        <Button 
                          variant="outline" 
                          size="icon" 
                          className="h-9 w-9 text-destructive hover:bg-destructive/10"
                          onClick={() => handleDelete(workflow.id)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-full min-h-[400px] text-muted-foreground">
                <Zap className="w-16 h-16 mb-4 opacity-20" />
                <h3 className="text-xl font-medium mb-2 text-foreground">No Workflows</h3>
                <p className="max-w-md text-center">Automate repetitive tasks by creating workflows that connect your AI capabilities.</p>
                <Button onClick={() => setIsCreateOpen(true)} className="mt-6">Create your first workflow</Button>
              </div>
            )}
          </ScrollArea>
        </Card>
      </div>

      {/* Run Result Dialog */}
      <Dialog open={isRunResultOpen} onOpenChange={setIsRunResultOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {runResult?.success ? (
                <><CheckCircle2 className="w-5 h-5 text-green-500" /> Execution Successful</>
              ) : (
                <><AlertCircle className="w-5 h-5 text-destructive" /> Execution Failed</>
              )}
            </DialogTitle>
          </DialogHeader>
          <div className="py-4">
            {runResult && (
              <div className="space-y-4">
                <div>
                  <p className="text-sm font-medium mb-1">Steps Executed</p>
                  <p className="text-sm text-muted-foreground">{runResult.stepsExecuted}</p>
                </div>
                <div>
                  <p className="text-sm font-medium mb-1">Output</p>
                  <div className="bg-muted p-3 rounded-md text-sm font-mono whitespace-pre-wrap max-h-[300px] overflow-y-auto">
                    {runResult.output}
                  </div>
                </div>
                {runResult.error && (
                  <div>
                    <p className="text-sm font-medium mb-1 text-destructive">Error Details</p>
                    <div className="bg-destructive/10 text-destructive p-3 rounded-md text-sm border border-destructive/20">
                      {runResult.error}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button onClick={() => setIsRunResultOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
